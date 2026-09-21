/*
 * IPAF (IRB Protocol Application Form) document generation script.
 * Renders the IPAF section-by-section from IPAF_SCHEMA and drives its
 * Draft -> S/D Director Approval -> For Review -> Under Review -> (For
 * Revision loop) -> Approved workflow, the same shape as the IRPF's.
 * Unlike the IRPF, there's no Co-Chairman/Chairman leadership tier -- IRB
 * Member review is the only review stage, per the IPAF spec. The
 * Secretariat/member review logic (act on partial votes, keep re-deciding,
 * stragglers can still vote even after the record moves on or gets routed
 * back) mirrors the IRPF's.
 */

class IpafFormController {
  constructor(record, currentRole) {
    this.record = record;
    this.currentRole = currentRole;
    this.fields = flattenFields(IPAF_SCHEMA);
    this.fieldEls = {};
    this.errors = {};
  }

  isEditableByPi() {
    return this.currentRole === 'pi' && ['draft', 'for_revision'].includes(this.record.status);
  }

  isPendingThisDirectorApproval() {
    return this.currentRole === 'sd-director' && this.record.status === 'pending_director_approval';
  }

  directorApprove() {
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

  getVotes() {
    return this.record.votes || [];
  }

  hasVoted(memberId) {
    return this.getVotes().some((v) => v.voterId === memberId);
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

  /* A member can cast their vote as soon as they're assigned, whether or not
   * the Secretariat has already acted on other members' votes and moved the
   * record on -- their review still gets recorded either way. This holds
   * even once the PI has resubmitted and it's routed back to the
   * Secretariat (pending_review): a straggler's vote still counts right up
   * until the Secretariat re-triages and starts a fresh review cycle. */
  isUnderReviewVotingOpenToMember() {
    return (
      this.isAssignedMember() &&
      !this.hasVoted(this.currentRole) &&
      (this.record.status === 'under_review' ||
        (['for_revision', 'approved', 'pending_review'].includes(this.record.status) && this.getVotes().length > 0))
    );
  }

  isUnassignedMemberViewingUnderReview() {
    return isIrbMember(this.currentRole) && !this.isAssignedMember() && this.record.status === 'under_review';
  }

  /* Secretariat can act on the member panel as soon as any member has voted
   * -- it doesn't wait for the rest -- and can keep acting on it (e.g.
   * reconsider after a late vote) right up until it's approved (terminal)
   * or the PI resubmits. */
  isPendingSecretariatUnderReviewAction() {
    return (
      isSecretariat(this.currentRole) &&
      this.record.routedTo === this.currentRole &&
      this.getVotes().length > 0 &&
      ['under_review', 'for_revision'].includes(this.record.status)
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

  isPendingAcknowledgement() {
    return this.currentRole === 'pi' && this.record.status === 'approved' && !this.record.acknowledged;
  }

  castVote(decision, comment) {
    if (!this.isAssignedMember()) {
      return { ok: false, error: 'This IPAF was not routed to you for review.' };
    }
    if (!decision) {
      return { ok: false, error: 'Select Approve or Return.' };
    }
    if (decision === 'Return' && !(comment || '').trim()) {
      return { ok: false, error: 'A comment is required when returning for revision.' };
    }
    if (this.hasVoted(this.currentRole)) {
      return { ok: false, error: `${getRoleLabel(this.currentRole)} has already voted on this IPAF.` };
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

  /* Secretariat's first (and only) action at For Review: send to the IRB Member panel. */
  routeToMembersForReview(comment, memberIds) {
    const assigned = memberIds || [];
    if (assigned.length === 0) {
      return { ok: false, error: 'Select at least one IRB Member to route this IPAF to.' };
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

  approveIpaf(comment) {
    this.record.status = 'approved';
    saveSubmission(this.record, {
      action: 'approved',
      actor: this.currentRole,
      status: this.record.status,
      note: comment || 'Approved.',
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

  getData() {
    return this.record.data;
  }

  mount(container) {
    container.innerHTML = '';
    IPAF_SCHEMA.forEach((section) => {
      const sectionEl = document.createElement('section');
      sectionEl.className = 'form-section';

      const heading = document.createElement('h2');
      heading.textContent = section.title;
      sectionEl.appendChild(heading);

      if (section.intro) {
        const list = document.createElement('ul');
        list.className = 'section-intro';
        section.intro.forEach((line) => {
          const li = document.createElement('li');
          li.textContent = line;
          list.appendChild(li);
        });
        sectionEl.appendChild(list);
      }

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
      textarea.rows = 4;
      textarea.value = currentValue || '';
      textarea.disabled = disabled;
      textarea.addEventListener('input', () => this.onFieldChanged(field));
      controlWrap.appendChild(textarea);
      return textarea;
    }

    if (field.type === 'yesno') {
      const options = field.options || ['Yes', 'No'];
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

    if (field.type === 'checkbox-group') {
      const group = document.createElement('div');
      group.className = 'checkbox-group stacked';
      const selected = Array.isArray(currentValue) ? currentValue : [];
      (field.options || []).forEach((opt) => {
        const optLabel = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = opt;
        checkbox.checked = selected.includes(opt);
        checkbox.disabled = disabled;
        checkbox.addEventListener('change', () => this.onFieldChanged(field));
        optLabel.appendChild(checkbox);
        optLabel.appendChild(document.createTextNode(' ' + opt));
        group.appendChild(optLabel);
      });
      controlWrap.appendChild(group);
      return group;
    }

    if (field.type === 'checkbox') {
      const optLabel = document.createElement('label');
      optLabel.className = 'radio-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = field.id;
      checkbox.checked = currentValue === true;
      checkbox.disabled = disabled;
      checkbox.addEventListener('change', () => this.onFieldChanged(field));
      optLabel.appendChild(checkbox);
      optLabel.appendChild(document.createTextNode(' I agree'));
      controlWrap.appendChild(optLabel);
      return checkbox;
    }

    if (field.type === 'people-list') {
      const wrap = document.createElement('div');
      wrap.className = 'people-list';
      wrap.id = `${field.id}-list`;
      this.renderPeopleList(field, wrap);
      controlWrap.appendChild(wrap);

      if (!disabled) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'btn btn-secondary btn-small';
        addBtn.textContent = 'Add Team Members';
        addBtn.addEventListener('click', () => this.addPerson(field));
        controlWrap.appendChild(addBtn);
      }
      return wrap;
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

  renderPeopleList(field, wrap) {
    const disabled = !this.isEditableByPi();
    const people = this.record.data[field.id] || [];
    wrap.innerHTML = '';
    people.forEach((person, index) => {
      const card = document.createElement('div');
      card.className = 'person-card';

      [
        ['name', 'Name'],
        ['role', 'Role', 'e.g. Principal Investigator, Co-Investigator, Research Assistant'],
        ['schoolDept', 'School/Department'],
        ['contact', 'Contact'],
        ['email', 'Email'],
      ].forEach(([key, label, placeholder]) => {
        const fieldRow = document.createElement('div');
        fieldRow.className = 'person-field-row';

        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = label;
        fieldRow.appendChild(fieldLabel);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder || label;
        input.value = person[key] || '';
        input.disabled = disabled;
        input.addEventListener('input', () => {
          people[index] = { ...people[index], [key]: input.value };
          this.record.data[field.id] = people;
        });
        fieldRow.appendChild(input);

        card.appendChild(fieldRow);
      });

      if (!disabled) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-remove-btn';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
          people.splice(index, 1);
          this.record.data[field.id] = people;
          this.renderPeopleList(field, wrap);
          this.refreshAll();
        });
        card.appendChild(removeBtn);
      }

      wrap.appendChild(card);
    });
  }

  addPerson(field) {
    const people = this.record.data[field.id] || [];
    people.push({ name: '', role: '', schoolDept: '', contact: '', email: '' });
    this.record.data[field.id] = people;
    this.renderPeopleList(field, document.getElementById(`${field.id}-list`));
    this.refreshAll();
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
    const els = this.fieldEls[field.id];
    let value = null;
    if (field.type === 'text' || field.type === 'textarea') {
      value = els.input.value;
    } else if (field.type === 'yesno') {
      const checked = els.input.querySelector('input[type="radio"]:checked');
      value = checked ? checked.value : null;
    } else if (field.type === 'checkbox-group') {
      value = Array.from(els.input.querySelectorAll('input[type="checkbox"]:checked')).map((c) => c.value);
    } else if (field.type === 'checkbox') {
      value = els.input.checked;
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
        (Array.isArray(value) && value.length === 0) ||
        (field.type === 'checkbox' && value !== true);

      if (this.isRequired(field, data) && isEmpty) {
        errors[field.id] = field.type === 'checkbox' ? 'You must agree to continue.' : 'This field is required.';
        return;
      }

      if (isEmpty) return;

      if (field.mustEqual !== undefined && value !== field.mustEqual) {
        errors[field.id] = 'You must agree to continue.';
        return;
      }

      if (field.maxWords && typeof value === 'string' && countWords(value) > field.maxWords) {
        errors[field.id] = `Exceeds maximum of ${field.maxWords} words.`;
        return;
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

  /* Reference numbers are assigned on first Submit, not on Save -- otherwise
   * every draft saved but never submitted would still burn a number from the
   * shared per-period counter, making submitted numbers look like they
   * "reset" or skip ahead. (createdAt is already set at creation time, via
   * the parent IRPF's "Create IPAF Form" action, so there's no separate
   * ensureCreated step here.) */
  assignRefNumber() {
    if (!this.record.data.refNumber) {
      this.record.data.refNumber = generateIPAFReferenceNumber(
        new Date(this.record.createdAt || Date.now()),
        this.record.data.categoryOfResearch
      );
      const displayEl = this.fieldEls.refNumber && this.fieldEls.refNumber.input;
      if (displayEl) displayEl.textContent = this.record.data.refNumber;
    }
  }

  save() {
    saveSubmission(this.record, { action: 'save', actor: this.currentRole, status: this.record.status });
    return { ok: true };
  }

  submit(comment) {
    const errors = this.validateAll();
    this.renderErrors(errors);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    this.assignRefNumber();
    this.record.data.piSubmissionDate = formatDateDDMMMYYYY(new Date());
    const piDateEl = this.fieldEls.piSubmissionDate && this.fieldEls.piSubmissionDate.input;
    if (piDateEl) piDateEl.textContent = this.record.data.piSubmissionDate;

    const wasForRevision = this.record.status === 'for_revision';

    if (wasForRevision) {
      // Resubmission after Secretariat's "Returned for Amendments" skips the
      // Director gate and routes straight back to the Secretariat, same as
      // the IRPF.
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
}
