/*
 * IRPF document generation script.
 * Renders the IRPF into the DOM section-by-section from IRPF_SCHEMA, wires
 * conditional field logic + validation, and drives the Draft -> Director
 * Approval -> Pending Review transitions (incl. reference-number assignment).
 * Shared helpers (flattenFields, countWords, formatDateDDMMMYYYY, file
 * reading) live in form-utils.js, loaded before this file.
 */

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

  /* A member can cast their vote as soon as they're assigned, whether or not
   * the Secretariat has already acted on other members' votes and moved the
   * record on — their review still gets recorded either way. This holds even
   * once the PI has resubmitted and it's routed back to the Secretariat
   * (pending_review): a straggler's vote still counts right up until the
   * Secretariat re-triages and starts a fresh review cycle. */
  isUnderReviewVotingOpenToMember() {
    return (
      this.isAssignedMember() &&
      !this.hasVoted(this.currentRole) &&
      (this.record.status === 'under_review' ||
        (['for_revision', 'pending_leadership_approval', 'approved', 'to_create_ipaf', 'pending_review'].includes(
          this.record.status
        ) &&
          this.getVotes().length > 0))
    );
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

  getLeadershipApprovals() {
    return this.record.leadershipApprovals || [];
  }

  hasLeadershipVoted(roleId) {
    return this.getLeadershipApprovals().some((a) => a.approverId === roleId);
  }

  allLeadersVoted() {
    return IRB_LEADERSHIP_IDS.every((id) => this.hasLeadershipVoted(id));
  }

  leadershipTally() {
    const approvals = this.getLeadershipApprovals();
    return {
      total: approvals.length,
      leadershipTotal: IRB_LEADERSHIP_IDS.length,
      approveCount: approvals.filter((a) => a.decision === 'Approve').length,
      returnCount: approvals.filter((a) => a.decision === 'Return').length,
      routeToSecretariatCount: approvals.filter((a) => a.decision === 'Route to Secretariat').length,
    };
  }

  /* Secretariat can act on the member panel as soon as any member has voted —
   * it doesn't wait for the rest to weigh in — and can keep acting on it (e.g.
   * reconsider after a late vote) right up until it's routed to leadership or
   * the PI resubmits. */
  isPendingSecretariatUnderReviewAction() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.routedTo === this.currentRole &&
      this.getVotes().length > 0 &&
      this.getLeadershipApprovals().length === 0 &&
      ['under_review', 'for_revision'].includes(this.record.status)
    );
  }

  /* Same idea for leadership: a leader can still cast their vote even after
   * the Secretariat has already recorded a final outcome based on the other
   * leader's vote, and even after the PI has resubmitted and it's routed
   * back to the Secretariat (pending_review). */
  isPendingLeadershipApproval() {
    return (
      isIrbLeadership(this.currentRole) &&
      !this.hasLeadershipVoted(this.currentRole) &&
      (this.record.status === 'pending_leadership_approval' ||
        (['approved', 'to_create_ipaf', 'for_revision', 'pending_review'].includes(this.record.status) &&
          this.getLeadershipApprovals().length > 0))
    );
  }

  isLeadershipWaitingOnOther() {
    return (
      isIrbLeadership(this.currentRole) &&
      this.record.status === 'pending_leadership_approval' &&
      this.hasLeadershipVoted(this.currentRole) &&
      !this.allLeadersVoted()
    );
  }

  /* Secretariat can record the final outcome as soon as any leader has voted —
   * it doesn't wait for both — and can keep re-deciding while the record is
   * still in flux (a late vote comes in after an early "Returned for
   * Amendments"). But once they pick Approved for Exemption ('approved') or
   * To Create IPAF ('to_create_ipaf'), the record has reached a true
   * terminal state and the task is closed: this panel doesn't reopen for
   * either. */
  isPendingSecretariatCollation() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.routedTo === this.currentRole &&
      this.getLeadershipApprovals().length > 0 &&
      ['pending_leadership_approval', 'for_revision'].includes(this.record.status)
    );
  }

  isAwaitingLeadershipApproval() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'pending_leadership_approval' &&
      this.record.routedTo === this.currentRole &&
      this.getLeadershipApprovals().length === 0
    );
  }

  isAwaitingMemberReview() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.status === 'under_review' &&
      this.record.routedTo === this.currentRole &&
      this.getVotes().length === 0
    );
  }

  voteTally() {
    const votes = this.getVotes();
    return {
      total: votes.length,
      assignedTotal: this.getAssignedMembers().length,
      approveCount: votes.filter((v) => v.decision === 'Approve').length,
      returnCount: votes.filter((v) => v.decision === 'Return').length,
      routeToSecretariatCount: votes.filter((v) => v.decision === 'Route to Secretariat').length,
    };
  }

  /* decision is 'Approve', 'Return', or 'Route to Secretariat' -- the last
   * one is a separate button (see irpf-page.js), not a radio option: the
   * member defers to the Secretariat instead of deciding Approve/Return
   * themselves. It's recorded the same way a vote is (so it still counts
   * toward hasVoted() and the "N of M voted" tally, and it's still shown in
   * the Comments panel to staff), but it doesn't trigger the Return bypass
   * below, and it's excluded from the PI's blinded feedback (see
   * renderCommentsPanel in irpf-page.js) since it's not review feedback. */
  castVote(decision, comment) {
    if (!this.isAssignedMember()) {
      return { ok: false, error: 'This IRPF was not routed to you for review.' };
    }
    if (!decision) {
      return { ok: false, error: 'Select Approve or Return.' };
    }
    if ((decision === 'Return' || decision === 'Route to Secretariat') && !(comment || '').trim()) {
      return {
        ok: false,
        error:
          decision === 'Return'
            ? 'A comment is required when returning for amendments.'
            : 'A comment is required when routing to the Secretariat.',
      };
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

    let note = `${vote.voterName}: ${decision}${vote.comment ? ' — ' + vote.comment : ''}`;

    /* A member's own "Return for Amendments" sends the IRPF straight back
     * to the PI -- bypassing the Secretariat's usual collation step --
     * rather than just being tallied for the Secretariat to act on later.
     * Resubmission routes it back to this same member (see submit()). */
    if (decision === 'Return') {
      this.record.status = 'for_revision';
      this.record.routedTo = this.currentRole;
      note += ' Routed directly to the PI for amendments.';
    } else if (isIrbMember(this.record.routedTo) && this.record.status === 'under_review') {
      /* This record is in a member bypass cycle -- routed straight back to
       * whichever member(s) returned it, skipping the Secretariat -- and
       * the PI has resubmitted (status moved to under_review; routedTo
       * still names whichever member returned *last*, but every returning
       * member gets a fresh vote, per submit() above). Checking the bypass
       * is active + we're past resubmission, rather than requiring routedTo
       * to name this exact member, means whichever one of them votes first
       * still correctly hands it back to the Secretariat -- otherwise, if
       * two members both returned and the "other" one (not the one
       * routedTo happens to still point at) votes, the Secretariat's
       * under-review action panel would never reopen. */
      const secretariat = secretariatRoleForCategory(this.record.data.categoryOfResearch);
      this.record.routedTo = secretariat;
      note += ` Routed back to ${getRoleLabel(secretariat)}.`;
    }

    saveSubmission(this.record, {
      action: 'member_vote',
      actor: this.currentRole,
      status: this.record.status,
      note,
      decision,
      comment: vote.comment,
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

  /* Same three decisions as castVote -- see its comment for what 'Route to
   * Secretariat' means and why it's handled the way it is. */
  castLeadershipVote(decision, comment) {
    if (!isIrbLeadership(this.currentRole)) {
      return { ok: false, error: 'This IRPF was not routed to you for review.' };
    }
    if (!decision) {
      return { ok: false, error: 'Select Approve or Return.' };
    }
    if ((decision === 'Return' || decision === 'Route to Secretariat') && !(comment || '').trim()) {
      return {
        ok: false,
        error:
          decision === 'Return'
            ? 'A comment is required when returning for amendments.'
            : 'A comment is required when routing to the Secretariat.',
      };
    }
    if (this.hasLeadershipVoted(this.currentRole)) {
      return { ok: false, error: `${getRoleLabel(this.currentRole)} has already reviewed this IRPF.` };
    }

    this.record.leadershipApprovals = this.getLeadershipApprovals();
    const approval = {
      approverId: this.currentRole,
      approverName: getRoleLabel(this.currentRole),
      decision,
      comment: (comment || '').trim(),
      timestamp: new Date().toISOString(),
    };
    this.record.leadershipApprovals.push(approval);

    let note = `${approval.approverName}: ${decision}${approval.comment ? ' — ' + approval.comment : ''}`;

    /* Same bypass as a member's return (see castVote): sends the IRPF
     * straight back to the PI instead of waiting on the Secretariat's
     * collation step. Resubmission routes it back to this same leader. */
    if (decision === 'Return') {
      this.record.status = 'for_revision';
      this.record.routedTo = this.currentRole;
      note += ' Routed directly to the PI for amendments.';
    } else if (isIrbLeadership(this.record.routedTo) && this.record.status === 'pending_leadership_approval') {
      /* Same hand-back as castVote's, and the same broadened check: a
       * leadership bypass is active and the PI has resubmitted, regardless
       * of whether routedTo currently names this exact leader -- both the
       * Chairman and the Co-Chairman can each Return independently before
       * the PI ever responds, and routedTo only ever remembers whichever
       * one did so *last*. Whichever of them votes first here still
       * correctly hands it back to the Secretariat so the collate panel
       * reopens. */
      const secretariat = secretariatRoleForCategory(this.record.data.categoryOfResearch);
      this.record.routedTo = secretariat;
      note += ` Routed back to ${getRoleLabel(secretariat)}.`;
    }

    saveSubmission(this.record, {
      action: 'leadership_vote',
      actor: this.currentRole,
      status: this.record.status,
      note,
      decision,
      comment: approval.comment,
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

      if (section.singleColumn) {
        section.fields.forEach((field) => {
          sectionEl.appendChild(this.buildFieldRow(field));
        });
      } else {
        const grid = document.createElement('div');
        grid.className = 'field-grid';
        section.fields.forEach((field) => {
          grid.appendChild(this.buildFieldRow(field));
        });
        sectionEl.appendChild(grid);
      }

      container.appendChild(sectionEl);
    });

    this.refreshAll();
  }

  buildFieldRow(field) {
    const row = document.createElement('div');
    row.className = isFullWidthField(field) ? 'field-row field-row--full' : 'field-row';
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
      this.renderFileList(field, list);
      controlWrap.appendChild(list);
      return input;
    }

    return null;
  }

  /* Files already recorded for this field. Every role can click a file to
   * view/download it; only the PI (while editing) gets the Remove link. */
  renderFileList(field, list) {
    const disabled = !this.isEditableByPi();
    list.innerHTML = '';
    (this.record.data[field.id] || []).forEach((f, index) => {
      const li = document.createElement('li');
      const label = `${f.name} (${Math.round(f.size / 1024)} KB)`;
      if (f.dataUrl) {
        const link = document.createElement('a');
        link.href = f.dataUrl;
        link.download = f.name;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = label;
        li.appendChild(link);
      } else {
        // Uploaded before file content was persisted -- nothing to open.
        // Say so plainly instead of showing what looks like a broken link.
        li.appendChild(
          document.createTextNode(`${label} — uploaded before file previews were supported; no content to open`)
        );
      }
      if (!disabled) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => this.removeFile(field, index));
        li.appendChild(removeBtn);
      }
      list.appendChild(li);
    });
  }

  removeFile(field, index) {
    const files = this.record.data[field.id] || [];
    files.splice(index, 1);
    this.record.data[field.id] = files;
    this.renderFileList(field, document.getElementById(`${field.id}-list`));
    this.refreshAll();
  }

  /* Selecting files again adds to what's already been uploaded for this
   * field instead of replacing it -- a fresh file dialog only ever reports
   * the files picked in that dialog, so without this the previous batch
   * would be lost. Each file's content is read as a data URL so anyone
   * viewing the record later can open it -- there's no server to fetch it
   * from. */
  async onFileChanged(field, input) {
    const els = this.fieldEls[field.id];
    const selected = Array.from(input.files);
    const tooBig = selected.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
    const okFiles = selected.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);

    if (els) {
      els.errorEl.textContent = tooBig.length
        ? `${tooBig.map((f) => f.name).join(', ')} — over the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit, not added.`
        : '';
    }

    const newFiles = await Promise.all(okFiles.map(readFileAsDataUrl));
    const existing = this.record.data[field.id] || [];
    const merged = field.multiple ? existing.slice() : [];
    newFiles.forEach((f) => {
      if (!merged.some((m) => m.name === f.name && m.size === f.size)) merged.push(f);
    });
    this.record.data[field.id] = merged;
    input.value = '';

    this.renderFileList(field, document.getElementById(`${field.id}-list`));
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

  ensureCreated() {
    if (!this.record.createdAt) {
      this.record.createdAt = new Date().toISOString();
    }
  }

  /* Reference numbers are assigned on first Submit, not on Save -- otherwise
   * every draft saved but never submitted would still burn a number from the
   * shared per-period counter, making submitted numbers look like they
   * "reset" or skip ahead. */
  assignRefNumber() {
    if (!this.record.data.refNumber) {
      this.record.data.refNumber = generateIRPFReferenceNumber(new Date(this.record.createdAt));
      const displayEl = this.fieldEls.refNumber && this.fieldEls.refNumber.input;
      if (displayEl) displayEl.textContent = this.record.data.refNumber;
    }
  }

  save() {
    this.ensureCreated();
    saveSubmission(this.record, { action: 'save', actor: this.currentRole, status: this.record.status });
    return { ok: true };
  }

  /* target only matters on a resubmission (wasForRevision): 'reviewer' sends
   * it back to the specific IRB Member/Leadership member who bypassed the
   * Secretariat to return it (reopening just their vote); anything else
   * (including the default, when there's no such reviewer to choose) sends
   * it to the Secretariat instead, leaving any existing votes/approvals
   * untouched. See castVote/castLeadershipVote for the bypass itself. */
  submit(comment, target) {
    const errors = this.validateAll();
    this.renderErrors(errors);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    this.ensureCreated();
    this.assignRefNumber();
    this.record.data.piSubmissionDate = formatDateDDMMMYYYY(new Date());
    const piDateEl = this.fieldEls.piSubmissionDate && this.fieldEls.piSubmissionDate.input;
    if (piDateEl) piDateEl.textContent = this.record.data.piSubmissionDate;

    const wasForRevision = this.record.status === 'for_revision';

    if (wasForRevision) {
      // Resubmission after a Return skips the Director gate either way.
      const returningReviewer = this.record.routedTo;
      const returnedByMember = isIrbMember(returningReviewer);
      const returnedByLeader = isIrbLeadership(returningReviewer);

      if ((returnedByMember || returnedByLeader) && target === 'reviewer') {
        if (returnedByMember) {
          // Every member with a live Return on record gets a clean slate --
          // not just whichever one routedTo happens to still point at. Two
          // members can each Return their own feedback before the PI ever
          // responds (routedTo only ever holds the *last* one), and the PI's
          // combined answer is meant to go back to all of them, not just one.
          const returningMembers = this.getVotes()
            .filter((v) => v.decision === 'Return')
            .map((v) => v.voterId);
          this.record.votes = this.getVotes().filter((v) => v.decision !== 'Return');
          this.record.status = 'under_review';
          const routedNote = `Resubmitted and routed back to ${returningMembers.map((id) => getRoleLabel(id)).join(', ')} for review.`;
          saveSubmission(this.record, {
            action: 'resubmit',
            actor: this.currentRole,
            status: this.record.status,
            note: comment && comment.trim() ? `${comment.trim()} — ${routedNote}` : routedNote,
            decision: 'Resubmitted',
            comment: (comment || '').trim(),
          });
        } else {
          // Same fix as above, for Leadership: both the Chairman and the
          // Co-Chairman can each Return independently before the PI
          // responds, and both need to see this as their pending action
          // again once resubmitted -- not just whichever one returned last.
          const returningLeaders = this.getLeadershipApprovals()
            .filter((a) => a.decision === 'Return')
            .map((a) => a.approverId);
          this.record.leadershipApprovals = this.getLeadershipApprovals().filter((a) => a.decision !== 'Return');
          this.record.status = 'pending_leadership_approval';
          const routedNote = `Resubmitted and routed back to ${returningLeaders.map((id) => getRoleLabel(id)).join(', ')} for approval.`;
          saveSubmission(this.record, {
            action: 'resubmit',
            actor: this.currentRole,
            status: this.record.status,
            note: comment && comment.trim() ? `${comment.trim()} — ${routedNote}` : routedNote,
            decision: 'Resubmitted',
            comment: (comment || '').trim(),
          });
        }
      } else {
        // Submit to Secretariat -- either it was the Secretariat's own
        // return, or the PI chose to loop the Secretariat in instead of the
        // specific reviewer who bypassed them. Either way, any existing
        // votes/approvals are left exactly as they are.
        const secretariat = secretariatRoleForCategory(this.record.data.categoryOfResearch);
        this.record.routedTo = secretariat;
        this.record.status = 'pending_review';
        const routedNote = `Resubmitted and routed to ${getRoleLabel(secretariat)}.`;
        saveSubmission(this.record, {
          action: 'resubmit',
          actor: this.currentRole,
          status: this.record.status,
          note: comment && comment.trim() ? `${comment.trim()} — ${routedNote}` : routedNote,
          decision: 'Resubmitted',
          comment: (comment || '').trim(),
        });
      }
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

  /* Only IRPFs approved for exemption need the PI to acknowledge -- one
   * that instead went to 'to_create_ipaf' has its own acknowledgement step
   * on the child IPAF once that's approved, so this never applies there. */
  isPendingAcknowledgement() {
    return (
      this.currentRole === 'pi' &&
      this.record.status === 'approved' &&
      this.record.reviewOutcome === 'exemption' &&
      !this.record.acknowledged
    );
  }

  acknowledge() {
    this.record.acknowledged = true;
    this.record.acknowledgedAt = new Date().toISOString();
    saveSubmission(this.record, {
      action: 'acknowledged',
      actor: this.currentRole,
      status: this.record.status,
      note: 'PI acknowledged their responsibilities.',
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
      decision: 'Returned for Amendments',
      comment: comment.trim(),
    });
    return { ok: true };
  }

  /* Secretariat's action at Pending Review: send to the IRB Member panel.
   * Clears any Leadership approvals left over from an earlier review cycle
   * (e.g. the record was returned and resubmitted after already reaching
   * Leadership) -- otherwise they'd linger and incorrectly block the
   * Secretariat's own under-review action panel from opening once these
   * fresh member votes come in, since that panel requires
   * getLeadershipApprovals().length === 0. */
  routeToMembersForReview(comment, memberIds) {
    const assigned = memberIds || [];
    if (assigned.length === 0) {
      return { ok: false, error: 'Select at least one IRB Member to route this IRPF to.' };
    }
    this.record.status = 'under_review';
    this.record.assignedMembers = assigned;
    this.record.votes = [];
    this.record.leadershipApprovals = [];
    const memberLabels = assigned.map((id) => getRoleLabel(id)).join(', ');
    saveSubmission(this.record, {
      action: 'routed_to_members',
      actor: this.currentRole,
      status: this.record.status,
      note: comment ? `${comment} Routed to: ${memberLabels}.` : `Routed to the IRB Member panel for review: ${memberLabels}.`,
    });
    return { ok: true };
  }

  /* Secretariat can re-route to IRB Members from the under-review action
   * panel without discarding votes already cast -- unlike
   * routeToMembersForReview()'s fresh review at triage, this just updates
   * who's assigned so a straggler or an added member can weigh in. A member
   * being (re-)assigned here always gets a clean slate, though: if they'd
   * already voted (or deferred via Route to Secretariat) in an earlier
   * round and are selected again, their stale vote would otherwise still
   * count as "voted", permanently hiding this from their Pending My Action
   * and blocking their vote panel from ever reopening for them. */
  routeToMembersFromUnderReview(comment, memberIds) {
    const assigned = memberIds || [];
    if (assigned.length === 0) {
      return { ok: false, error: 'Select at least one IRB Member to route this IRPF to.' };
    }
    this.record.assignedMembers = assigned;
    this.record.votes = this.getVotes().filter((v) => !assigned.includes(v.voterId));
    this.record.status = 'under_review';
    const memberLabels = assigned.map((id) => getRoleLabel(id)).join(', ');
    saveSubmission(this.record, {
      action: 'routed_to_members',
      actor: this.currentRole,
      status: this.record.status,
      note: comment ? `${comment} Routed to: ${memberLabels}.` : `Routed to the IRB Member panel for review: ${memberLabels}.`,
    });
    return { ok: true };
  }

  /* Secretariat can send a collated IRPF (Leadership has already voted)
   * back to the IRB Member panel -- e.g. if Leadership's decision surfaces
   * a gap that needs fresh member input. Leadership approvals are
   * discarded, since they'd need to vote again once it gets back to them;
   * existing member votes are kept, same as routeToMembersFromUnderReview()
   * -- including its same fix: a member being (re-)assigned here always
   * gets a clean slate, so a stale vote from an earlier round can't keep
   * hiding this from their Pending My Action. */
  routeToMembersFromCollate(comment, memberIds) {
    const assigned = memberIds || [];
    if (assigned.length === 0) {
      return { ok: false, error: 'Select at least one IRB Member to route this IRPF to.' };
    }
    this.record.assignedMembers = assigned;
    this.record.votes = this.getVotes().filter((v) => !assigned.includes(v.voterId));
    this.record.leadershipApprovals = [];
    this.record.status = 'under_review';
    const memberLabels = assigned.map((id) => getRoleLabel(id)).join(', ');
    saveSubmission(this.record, {
      action: 'routed_to_members',
      actor: this.currentRole,
      status: this.record.status,
      note: comment
        ? `${comment} Routed to: ${memberLabels}. Leadership approvals cleared.`
        : `Routed to the IRB Member panel for review: ${memberLabels}. Leadership approvals cleared.`,
    });
    return { ok: true };
  }

  /* One of the Secretariat's three final decisions, available once all assigned members have voted. */
  decideToCreateIpaf(comment) {
    this.record.status = 'to_create_ipaf';
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
