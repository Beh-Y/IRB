/*
 * IRPF document generation script.
 * Renders the IRPF into the DOM section-by-section from IRPF_SCHEMA, wires
 * conditional field logic + validation, and drives the Draft -> Director
 * Approval -> Pending Review transitions (incl. reference-number assignment).
 */

function flattenFields(schema) {
  return schema.flatMap((section) => section.fields);
}

function countWords(str) {
  return (str || '').trim().split(/\s+/).filter(Boolean).length;
}

function formatDateDDMMMYYYY(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

class IrpfFormController {
  constructor(record, currentRole) {
    this.record = record;
    this.currentRole = currentRole;
    this.fields = flattenFields(IRPF_SCHEMA);
    this.fieldEls = {}; // fieldId -> { wrapper, input(s), errorEl, hintEl }
    this.errors = {};
  }

  isEditableByPi() {
    return this.currentRole === 'pi' && ['draft', 'for_revision'].includes(this.record.status);
  }

  isPendingThisDirectorApproval() {
    return this.currentRole === 'sd-director' && this.record.status === 'pending_director_approval';
  }

  isPendingSecretariatTriage() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'pending_review' &&
      this.record.routedTo === this.currentRole
    );
  }

  getAssignedMembers() {
    return this.record.assignedMembers || [];
  }

  isAssignedMember() {
    return isIrbMember(this.currentRole) && this.getAssignedMembers().includes(this.currentRole);
  }

  isUnderReviewVotingOpenToMember() {
    return this.isAssignedMember() && this.record.status === 'under_review';
  }

  isUnassignedMemberViewingUnderReview() {
    return isIrbMember(this.currentRole) && !this.isAssignedMember() && this.record.status === 'under_review';
  }

  getVotes() {
    return this.record.votes || [];
  }

  hasVoted(memberId) {
    return this.getVotes().some((v) => v.voterId === memberId);
  }

  allAssignedMembersVoted() {
    const assigned = this.getAssignedMembers();
    return assigned.length > 0 && assigned.every((memberId) => this.hasVoted(memberId));
  }

  /* True once every assigned member approved (vs. at least one Return). */
  unanimousMemberApproval() {
    const assigned = this.getAssignedMembers();
    return (
      assigned.length > 0 &&
      assigned.every((memberId) => {
        const vote = this.getVotes().find((v) => v.voterId === memberId);
        return vote && vote.decision === 'Approve';
      })
    );
  }

  getLeadershipApprovals() {
    return this.record.leadershipApprovals || [];
  }

  hasLeadershipApproved(roleId) {
    return this.getLeadershipApprovals().some((a) => a.approverId === roleId);
  }

  bothLeadersApproved() {
    return IRB_LEADERSHIP_IDS.every((id) => this.hasLeadershipApproved(id));
  }

  /* Secretariat's action once members unanimously approve: escalate to leadership. */
  isPendingSecretariatRouteToLeadership() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'under_review' &&
      this.record.routedTo === this.currentRole &&
      this.allAssignedMembersVoted() &&
      this.unanimousMemberApproval()
    );
  }

  isPendingLeadershipApproval() {
    return (
      isIrbLeadership(this.currentRole) &&
      this.record.status === 'pending_leadership_approval' &&
      !this.hasLeadershipApproved(this.currentRole)
    );
  }

  isLeadershipWaitingOnOther() {
    return (
      isIrbLeadership(this.currentRole) &&
      this.record.status === 'pending_leadership_approval' &&
      this.hasLeadershipApproved(this.currentRole) &&
      !this.bothLeadersApproved()
    );
  }

  isAwaitingLeadershipApproval() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'pending_leadership_approval' &&
      this.record.routedTo === this.currentRole &&
      !this.bothLeadersApproved()
    );
  }

  /* True once every assigned IRB Member has sent their review back to the Secretariat
   * with at least one Return (the unanimous-approval path escalates to leadership
   * instead), or once both Co-Chairman and Chairman have signed off. */
  isPendingSecretariatCollation() {
    if (!isSecretariat(this.currentRole) || this.record.routedTo !== this.currentRole) return false;
    if (this.record.status === 'under_review') {
      return this.allAssignedMembersVoted() && !this.unanimousMemberApproval();
    }
    if (this.record.status === 'pending_leadership_approval') {
      return this.bothLeadersApproved();
    }
    return false;
  }

  isAwaitingMemberReview() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'under_review' &&
      this.record.routedTo === this.currentRole &&
      !this.allAssignedMembersVoted()
    );
  }

  voteTally() {
    const votes = this.getVotes();
    return {
      total: votes.length,
      assignedTotal: this.getAssignedMembers().length,
      approveCount: votes.filter((v) => v.decision === 'Approve').length,
      returnCount: votes.filter((v) => v.decision === 'Return').length,
    };
  }

  castVote(decision, comment) {
    if (!this.isAssignedMember()) {
      return { ok: false, error: 'This IRPF was not routed to you for review.' };
    }
    if (!decision) {
      return { ok: false, error: 'Select Approve or Return.' };
    }
    if (decision === 'Return' && !(comment || '').trim()) {
      return { ok: false, error: 'A comment is required when returning for revision.' };
    }
    if (this.hasVoted(this.currentRole)) {
      return { ok: false, error: `${getRoleLabel(this.currentRole)} has already voted on this IRPF.` };
    }

    this.record.votes = this.getVotes();
    const vote = {
      voterId: this.currentRole,
      voterName: getRoleLabel(this.currentRole),
      decision,
      comment: (comment || '').trim(),
      timestamp: new Date().toISOString(),
    };
    this.record.votes.push(vote);

    saveSubmission(this.record, {
      action: 'member_vote',
      actor: this.currentRole,
      status: this.record.status,
      note: `${vote.voterName}: ${decision}${vote.comment ? ' — ' + vote.comment : ''}`,
    });
    return { ok: true };
  }

  /* Secretariat escalates a unanimously-approved IRPF to the Co-Chairman and Chairman. */
  routeToLeadershipApproval(comment) {
    this.record.status = 'pending_leadership_approval';
    this.record.leadershipApprovals = [];
    saveSubmission(this.record, {
      action: 'routed_to_leadership',
      actor: this.currentRole,
      status: this.record.status,
      note: comment || 'Routed to the IRB Co-Chairman and Chairman for approval.',
    });
    return { ok: true };
  }

  approveAsLeadership(comment) {
    if (!isIrbLeadership(this.currentRole)) {
      return { ok: false, error: 'This IRPF was not routed to you for approval.' };
    }
    if (this.hasLeadershipApproved(this.currentRole)) {
      return { ok: false, error: `${getRoleLabel(this.currentRole)} has already approved this IRPF.` };
    }

    this.record.leadershipApprovals = this.getLeadershipApprovals();
    this.record.leadershipApprovals.push({
      approverId: this.currentRole,
      approverName: getRoleLabel(this.currentRole),
      timestamp: new Date().toISOString(),
    });

    saveSubmission(this.record, {
      action: 'leadership_approve',
      actor: this.currentRole,
      status: this.record.status,
      note: comment && comment.trim() ? comment.trim() : `${getRoleLabel(this.currentRole)} approved.`,
    });
    return { ok: true };
  }

  getData() {
    return this.record.data;
  }

  mount(container) {
    container.innerHTML = '';
    IRPF_SCHEMA.forEach((section) => {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'form-section';

      const heading = document.createElement('h2');
      heading.textContent = section.title;
      sectionEl.appendChild(heading);

      section.fields.forEach((field) => {
        sectionEl.appendChild(this.buildFieldRow(field));
      });

      container.appendChild(sectionEl);
    });

    this.refreshAll();
  }

  buildFieldRow(field) {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.dataset.fieldId = field.id;

    const labelWrap = document.createElement('div');
    labelWrap.className = 'field-label';
    const label = document.createElement('label');
    label.textContent = field.label + (field.required || field.requiredIf ? ' *' : '');
    label.setAttribute('for', field.id);
    labelWrap.appendChild(label);

    if (field.info) {
      const info = document.createElement('span');
      info.className = 'info-icon';
      info.textContent = 'i';
      info.tabIndex = 0;
      info.title = field.info;
      labelWrap.appendChild(info);
    }

    row.appendChild(labelWrap);

    const controlWrap = document.createElement('div');
    controlWrap.className = 'field-control';
    const input = this.buildControl(field, controlWrap);

    const hintEl = document.createElement('div');
    hintEl.className = 'field-hint';
    controlWrap.appendChild(hintEl);

    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    controlWrap.appendChild(errorEl);

    row.appendChild(controlWrap);

    this.fieldEls[field.id] = { row, input, hintEl, errorEl };
    return row;
  }

  buildControl(field, controlWrap) {
    const disabled = !this.isEditableByPi();
    const currentValue = this.record.data[field.id];

    if (field.type === 'display') {
      const div = document.createElement('div');
      div.className = 'field-display';
      div.id = field.id;
      div.textContent = currentValue || '—';
      controlWrap.appendChild(div);
      return div;
    }

    if (field.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = field.id;
      input.value = currentValue || '';
      input.disabled = disabled;
      input.addEventListener('input', () => this.onFieldChanged(field));
      controlWrap.appendChild(input);
      return input;
    }

    if (field.type === 'textarea') {
      const textarea = document.createElement('textarea');
      textarea.id = field.id;
      textarea.rows = field.maxWords && field.maxWords > 1000 ? 8 : 4;
      textarea.value = currentValue || '';
      textarea.disabled = disabled;
      textarea.addEventListener('input', () => this.onFieldChanged(field));
      controlWrap.appendChild(textarea);
      return textarea;
    }

    if (field.type === 'date') {
      const input = document.createElement('input');
      input.type = 'date';
      input.id = field.id;
      input.value = currentValue || '';
      input.disabled = disabled;
      input.addEventListener('change', () => this.onFieldChanged(field));
      controlWrap.appendChild(input);
      return input;
    }

    if (field.type === 'radio' || field.type === 'yesno' || field.type === 'yesna') {
      const options = field.options || (field.type === 'yesno' ? ['Yes', 'No'] : ['Yes', 'N.A.']);
      const group = document.createElement('div');
      group.className = 'radio-group';
      options.forEach((opt) => {
        const optLabel = document.createElement('label');
        optLabel.className = 'radio-option';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = field.id;
        radio.value = opt;
        radio.checked = currentValue === opt;
        radio.disabled = disabled;
        radio.addEventListener('change', () => this.onFieldChanged(field));
        optLabel.appendChild(radio);
        optLabel.appendChild(document.createTextNode(' ' + opt));
        group.appendChild(optLabel);
      });
      controlWrap.appendChild(group);
      return group;
    }

    if (field.type === 'file') {
      const input = document.createElement('input');
      input.type = 'file';
      input.id = field.id;
      input.multiple = !!field.multiple;
      input.accept = field.accept || '';
      input.disabled = disabled;
      input.addEventListener('change', () => this.onFileChanged(field, input));
      controlWrap.appendChild(input);

      const list = document.createElement('ul');
      list.className = 'file-list';
      list.id = `${field.id}-list`;
      (currentValue || []).forEach((f) => {
        const li = document.createElement('li');
        li.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
        list.appendChild(li);
      });
      controlWrap.appendChild(list);
      return input;
    }

    return null;
  }

  onFileChanged(field, input) {
    const meta = Array.from(input.files).map((f) => ({ name: f.name, size: f.size, type: f.type }));
    this.record.data[field.id] = meta;

    const list = document.getElementById(`${field.id}-list`);
    list.innerHTML = '';
    meta.forEach((f) => {
      const li = document.createElement('li');
      li.textContent = `${f.name} (${Math.round(f.size / 1024)} KB)`;
      list.appendChild(li);
    });

    this.refreshAll();
  }

  onFieldChanged(field) {
    const el = this.fieldEls[field.id];
    let value = null;
    if (field.type === 'text' || field.type === 'textarea' || field.type === 'date') {
      value = el.input.value;
    } else if (field.type === 'radio' || field.type === 'yesno' || field.type === 'yesna') {
      const checked = el.input.querySelector('input[type="radio"]:checked');
      value = checked ? checked.value : null;
    }
    this.record.data[field.id] = value;
    this.refreshAll();
  }

  refreshAll() {
    const data = this.record.data;
    this.fields.forEach((field) => {
      const els = this.fieldEls[field.id];
      if (!els) return;

      const visible = field.visibleIf ? !!field.visibleIf(data) : true;
      els.row.hidden = !visible;
      if (!visible) return;

      if (field.maxWords) {
        const value = typeof data[field.id] === 'string' ? data[field.id] : '';
        els.hintEl.textContent = `${countWords(value)} / ${field.maxWords} words${field.hint ? ' — ' + field.hint : ''}`;
      } else if (field.maxChars) {
        const value = typeof data[field.id] === 'string' ? data[field.id] : '';
        els.hintEl.textContent = `${value.length} / ${field.maxChars} characters${field.hint ? ' — ' + field.hint : ''}`;
      } else if (field.hint) {
        els.hintEl.textContent = field.hint;
      } else {
        els.hintEl.textContent = '';
      }
    });
  }

  isRequired(field, data) {
    if (field.required) return true;
    if (field.requiredIf) return !!field.requiredIf(data);
    return false;
  }

  isVisible(field, data) {
    return field.visibleIf ? !!field.visibleIf(data) : true;
  }

  validateAll() {
    const data = this.record.data;
    const errors = {};

    this.fields.forEach((field) => {
      if (!this.isVisible(field, data)) return;
      const value = data[field.id];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);

      if (this.isRequired(field, data) && isEmpty) {
        errors[field.id] = 'This field is required.';
        return;
      }

      if (isEmpty) return;

      if (field.mustEqual && value !== field.mustEqual) {
        errors[field.id] = `Must be "${field.mustEqual}" to submit.`;
        return;
      }

      if (field.maxWords && typeof value === 'string' && countWords(value) > field.maxWords) {
        errors[field.id] = `Exceeds maximum of ${field.maxWords} words.`;
        return;
      }

      if (field.maxChars && typeof value === 'string' && value.length > field.maxChars) {
        errors[field.id] = `Exceeds maximum of ${field.maxChars} characters.`;
        return;
      }

      if (field.validate) {
        const err = field.validate(value, data, this.record);
        if (err) {
          errors[field.id] = err;
          return;
        }
      }
    });

    return errors;
  }

  renderErrors(errors) {
    this.fields.forEach((field) => {
      const els = this.fieldEls[field.id];
      if (!els) return;
      els.errorEl.textContent = errors[field.id] || '';
      els.row.classList.toggle('has-error', !!errors[field.id]);
    });
  }

  ensureCreatedAndRefNumber() {
    if (!this.record.createdAt) {
      this.record.createdAt = new Date().toISOString();
    }
    if (!this.record.data.refNumber) {
      this.record.data.refNumber = generateIRPFReferenceNumber(new Date(this.record.createdAt));
      const displayEl = this.fieldEls.refNumber && this.fieldEls.refNumber.input;
      if (displayEl) displayEl.textContent = this.record.data.refNumber;
    }
  }

  save() {
    this.ensureCreatedAndRefNumber();
    saveSubmission(this.record, { action: 'save', actor: this.currentRole, status: this.record.status });
    return { ok: true };
  }

  submit(comment) {
    const errors = this.validateAll();
    this.renderErrors(errors);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    this.ensureCreatedAndRefNumber();
    this.record.data.piSubmissionDate = formatDateDDMMMYYYY(new Date());
    const piDateEl = this.fieldEls.piSubmissionDate && this.fieldEls.piSubmissionDate.input;
    if (piDateEl) piDateEl.textContent = this.record.data.piSubmissionDate;

    const wasForRevision = this.record.status === 'for_revision';

    if (wasForRevision) {
      // Resubmission after Secretariat's "Returned for Amendments" skips the
      // Director gate and routes straight back to the Secretariat, per spec.
      const secretariat = secretariatRoleForCategory(this.record.data.categoryOfResearch);
      this.record.routedTo = secretariat;
      this.record.status = 'pending_review';
      const routedNote = `Resubmitted and routed to ${getRoleLabel(secretariat)}.`;
      saveSubmission(this.record, {
        action: 'resubmit',
        actor: this.currentRole,
        status: this.record.status,
        note: comment && comment.trim() ? `${comment.trim()} — ${routedNote}` : routedNote,
      });
    } else {
      this.record.status = 'pending_director_approval';
      saveSubmission(this.record, {
        action: 'submit',
        actor: this.currentRole,
        status: this.record.status,
        note: 'Routed to S/D Director for approval.',
      });
    }

    return { ok: true };
  }

  directorApprove() {
    this.record.data.directorApprovalDate = formatDateDDMMMYYYY(new Date());
    const dirDateEl = this.fieldEls.directorApprovalDate && this.fieldEls.directorApprovalDate.input;
    if (dirDateEl) dirDateEl.textContent = this.record.data.directorApprovalDate;

    const secretariat = secretariatRoleForCategory(this.record.data.categoryOfResearch);
    this.record.routedTo = secretariat;
    this.record.status = 'pending_review';
    saveSubmission(this.record, {
      action: 'director_approve',
      actor: this.currentRole,
      status: this.record.status,
      note: `Auto-routed to ${getRoleLabel(secretariat)} based on Category of Research.`,
    });
    return { ok: true };
  }

  approveForExemption(comment) {
    this.record.status = 'approved';
    this.record.reviewOutcome = 'exemption';
    this.record.ipafRequired = false;
    saveSubmission(this.record, {
      action: 'approved_for_exemption',
      actor: this.currentRole,
      status: this.record.status,
      note: comment || 'Approved for exemption. No IPAF required.',
    });
    return { ok: true };
  }

  returnForAmendments(comment) {
    if (!comment || !comment.trim()) {
      return { ok: false, error: 'A comment is required so the PI knows what to amend.' };
    }
    this.record.status = 'for_revision';
    saveSubmission(this.record, {
      action: 'returned_for_amendments',
      actor: this.currentRole,
      status: this.record.status,
      note: comment.trim(),
    });
    return { ok: true };
  }

  /* Secretariat's first (and only) action at Pending Review: send to the IRB Member panel. */
  routeToMembersForReview(comment, memberIds) {
    const assigned = memberIds || [];
    if (assigned.length === 0) {
      return { ok: false, error: 'Select at least one IRB Member to route this IRPF to.' };
    }
    this.record.status = 'under_review';
    this.record.assignedMembers = assigned;
    this.record.votes = [];
    const memberLabels = assigned.map((id) => getRoleLabel(id)).join(', ');
    saveSubmission(this.record, {
      action: 'routed_to_members',
      actor: this.currentRole,
      status: this.record.status,
      note: comment ? `${comment} Routed to: ${memberLabels}.` : `Routed to the IRB Member panel for review: ${memberLabels}.`,
    });
    return { ok: true };
  }

  /* One of the Secretariat's three final decisions, available once all assigned members have voted. */
  decideToCreateIpaf(comment) {
    this.record.status = 'approved';
    this.record.reviewOutcome = 'full_review';
    this.record.ipafRequired = true;
    const tally = this.voteTally();
    saveSubmission(this.record, {
      action: 'to_create_ipaf',
      actor: this.currentRole,
      status: this.record.status,
      note: comment || `Confirmed: IPAF required, following review by ${tally.assignedTotal} IRB Member(s).`,
    });
    return { ok: true };
  }
}
