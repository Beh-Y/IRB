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

  submit() {
    const errors = this.validateAll();
    this.renderErrors(errors);
    if (Object.keys(errors).length > 0) {
      return { ok: false, errors };
    }

    this.ensureCreatedAndRefNumber();
    this.record.data.piSubmissionDate = formatDateDDMMMYYYY(new Date());
    const piDateEl = this.fieldEls.piSubmissionDate && this.fieldEls.piSubmissionDate.input;
    if (piDateEl) piDateEl.textContent = this.record.data.piSubmissionDate;

    this.record.status = 'pending_director_approval';
    saveSubmission(this.record, {
      action: 'submit',
      actor: this.currentRole,
      status: this.record.status,
      note: 'Routed to S/D Director for approval.',
    });
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
}
