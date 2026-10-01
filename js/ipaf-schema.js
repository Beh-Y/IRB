/* Field/section definitions for the IPAF (IRB Protocol Application Form), transcribed from the IPAF spec. */

const IPAF_FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';

const IPAF_PROJECT_TYPE_OPTIONS = [
  'Clinical research',
  'Clinical research involving drug administration',
  'Test, surveys, interviews public behaviour observation',
  'Food tasting evaluation/Consumer acceptance studies',
  'Vision research and psychophysics',
  'For database',
  'Food samples contain additives, agricultural chemicals, or environmental contaminant',
  'Using existing data, documents, records pathological specimens, or diagnostic specimens',
];

const IPAF_DECLARATION_STATEMENTS = [
  'I will not initiate this study until I have received approval notification email from the IRB.',
  'I will not initiate any change in the study protocol without prior written approval from the IRB, except when it is ' +
    'necessary to reduce or eliminate any immediate risks to the Research Participants. Thereafter, I will submit the ' +
    'proposed amendment to the IRB for approval.',
  'I will promptly report any unexpected or serious adverse events, unanticipated problems or incidents that may occur in ' +
    'the course of this study.',
  'I will maintain all relevant documents and recognise that the IRB staff and applicable regulatory authorities may ' +
    'inspect these records.',
  'I understand that failure to comply with all applicable regulations, institutional and IRB policies and requirements ' +
    'may result in the suspension or termination of this study.',
  'I declare that there are no existing or potential conflicts of interest for any of the investigators participating in ' +
    'this study.',
];

const IPAF_SCHEMA = [
  {
    id: 'header',
    title: 'IRB Reference Number',
    fields: [
      { id: 'irpfReferenceNumber', label: 'IRPF Reference Number', type: 'display', hint: 'Carried from IRPF' },
      { id: 'refNumber', label: 'IPAF Reference Number', type: 'display' },
    ],
  },
  {
    id: 'projectDetails',
    title: 'Project Details',
    fields: [
      { id: 'projectTitle', label: 'Project Title', type: 'display', hint: 'Carried from IRPF' },
      { id: 'projectStartDate', label: 'Project Start Date', type: 'display', hint: 'Carried from IRPF' },
      { id: 'projectEndDate', label: 'Project End Date', type: 'display', hint: 'Carried from IRPF' },
    ],
  },
  {
    id: 'sectionA',
    title: 'Section A – Project Team',
    fields: [
      {
        id: 'principalInvestigators',
        label: 'Principal Investigator Name',
        type: 'people-list',
        required: true,
        hint: 'Add the Principal Investigator, then use "Add Team Members" for anyone else on the project team.',
      },
    ],
  },
  {
    id: 'sectionC',
    title: 'Section C – Nature of Project',
    fields: [
      {
        id: 'involvesHumanSubjects',
        label: 'Is the project an activity involving human subjects?',
        type: 'yesno',
        required: true,
      },
      {
        id: 'involvesHumanSubjectsDetails',
        label: 'Please elaborate',
        type: 'textarea',
        maxWords: 300,
        visibleIf: (d) => d.involvesHumanSubjects === 'Yes',
        requiredIf: (d) => d.involvesHumanSubjects === 'Yes',
      },
      {
        id: 'projectTypes',
        label: 'Type of Project',
        type: 'checkbox-group',
        options: IPAF_PROJECT_TYPE_OPTIONS,
        required: true,
        hint: 'Must select at least one.',
      },
      {
        id: 'protocolApplicationForm',
        label: 'Protocol Application Form',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
        required: true,
      },
      {
        id: 'participantInfoConsentForm',
        label: 'Participant Information Sheet & Consent Form',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
      },
      {
        id: 'recruitmentMaterials',
        label: 'Recruitment Materials (Flyer, Advertisements, Emails, Brochures)',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
      },
      {
        id: 'citiCertificate',
        label: 'Valid CITI Programme Certificate',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
        required: true,
      },
      {
        id: 'dataCollectionForm',
        label: 'Data Collection Form/Survey Form',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
      },
      {
        id: 'scientificEvaluationRefs',
        label: 'Scientific Evaluation/References/Publication',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
      },
      {
        id: 'piCv',
        label: 'Curriculum Vitae of Principal Investigator(s)',
        type: 'file',
        multiple: true,
        accept: IPAF_FILE_ACCEPT,
        required: true,
      },
    ],
  },
  {
    id: 'sectionK',
    title: 'Section K – Declaration by PI',
    intro: IPAF_DECLARATION_STATEMENTS,
    // Each declaration is a long statement paired with a short control --
    // two per row leaves too little width for the text, so this section
    // stays one field per row instead of the usual two-column grid.
    singleColumn: true,
    fields: [
      {
        id: 'declarationAgree',
        label:
          'By checking the "I agree" box, you confirm that you have read, understood and accept the Principal ' +
          "Investigator's Declaration.",
        type: 'checkbox',
        required: true,
        mustEqual: true,
      },
      { id: 'piSubmissionDate', label: 'Date of Submission (PI)', type: 'display' },
    ],
  },
];
