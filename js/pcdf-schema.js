/* Field/section definitions for the PCDF (Publication Checklist Declaration Form),
 * transcribed from the PCDF spec. Standalone form -- no parent IRPF, so the fields
 * the spec marks "Computer" (normally carried from a linked project record) are
 * PI-entered here instead. */

const PCDF_SCHEMA = [
  {
    id: 'header',
    title: 'IRB Reference Number',
    fields: [{ id: 'refNumber', label: 'PCDF Reference Number', type: 'display' }],
  },
  {
    id: 'projectDetails',
    title: 'Project Details',
    fields: [
      { id: 'projectTitle', label: 'Project Title', type: 'text', required: true },
      { id: 'projectStartDate', label: 'Project Start Date', type: 'date', required: true },
      { id: 'projectEndDate', label: 'Project End Date', type: 'date', required: true },
      { id: 'principalInvestigatorName', label: 'Principal Investigator Name', type: 'text', required: true },
    ],
  },
  {
    id: 'declaration',
    title: 'Declaration',
    fields: [
      {
        id: 'declIrbSubmittedApproved',
        label:
          'I hereby confirm that any work for the project that involves human subjects, biological materials, health, or ' +
          'physiological information of living individuals, has been submitted to or approved by SP Institutional Review ' +
          'Board (SP IRB) or relevant IRB.',
        type: 'yesna',
        required: true,
      },
      {
        id: 'declIrbSubmittedApprovedExplainNA',
        label: 'Explain',
        type: 'text',
        visibleIf: (d) => d.declIrbSubmittedApproved === 'N.A.',
        requiredIf: (d) => d.declIrbSubmittedApproved === 'N.A.',
      },
      {
        id: 'declCoiIdentified',
        label:
          'I hereby declare that any potential conflicts of interest that could influence the research outcomes/interpretations ' +
          'has been identified.',
        type: 'yesna',
        required: true,
      },
      {
        id: 'coiDetails',
        label: 'Please state the identified potential conflicts of interest.',
        type: 'text',
        visibleIf: (d) => d.declCoiIdentified === 'Yes',
        requiredIf: (d) => d.declCoiIdentified === 'Yes',
      },
      {
        id: 'coiExplainNA',
        label: 'Explain.',
        type: 'text',
        visibleIf: (d) => d.declCoiIdentified === 'N.A.',
        requiredIf: (d) => d.declCoiIdentified === 'N.A.',
      },
      {
        id: 'declHonesty',
        label: 'I hereby declare that I shall maintain honesty in data collection, analysis, and reporting in my project/research.',
        type: 'yesno',
        required: true,
        mustEqual: 'Yes',
      },
      {
        id: 'declInformedConsent',
        label:
          'I hereby declare that for research covered in the project involving human subjects, I shall obtain informed consent. ' +
          "I further confirm that I shall inform all participants of the research's purpose, methods, and any potential risks.",
        type: 'yesna',
        required: true,
      },
      {
        id: 'declInformedConsentExplainNA',
        label: 'Explain.',
        type: 'text',
        visibleIf: (d) => d.declInformedConsent === 'N.A.',
        requiredIf: (d) => d.declInformedConsent === 'N.A.',
      },
      {
        id: 'declAuthorshipContribution',
        label:
          'I hereby declare and confirm that all listed authors have made a significant contribution to the research and the ' +
          'writing of the paper. I further confirm that all who have made a significant contribution are credited as authors.',
        type: 'yesno',
        required: true,
      },
      {
        id: 'declPlagiarismCheck',
        label:
          'I hereby declare that I shall use plagiarism detection software (e.g. Turnitin) to ensure the originality of the ' +
          'manuscript, because plagiarism in any form is unacceptable.',
        type: 'yesno',
        required: true,
      },
      {
        id: 'declCoiDisclosedToSp',
        label:
          'I hereby declare that any potential conflicts of interest that could influence the research outcomes or ' +
          'interpretations has been disclosed to SP.',
        type: 'yesno',
        required: true,
      },
      {
        id: 'declIpResponsibility',
        label:
          'I hereby declare that I am fully responsible for the content of the Intellectual Property in the paper, and the ' +
          'Intellectual Property itself would not tarnish the good name of SP. To the best of my knowledge, there is no known ' +
          "infringement of any third party's rights in the Intellectual Property.",
        type: 'yesno',
        required: true,
      },
      {
        id: 'declSingleSubmission',
        label:
          'I hereby declare that I shall submit/publish one and the same paper to no more than one external conference/journal, ' +
          'provided that there is no explicit rejection from the one external conference/journal.',
        type: 'yesno',
        required: true,
      },
      {
        id: 'declEthicalPublishing',
        label:
          'I hereby declare that the paper is submitted to reputable, peer-reviewed academic conferences/journals that follow ' +
          'ethical publishing practices.',
        type: 'yesno',
        required: true,
      },
    ],
  },
  {
    id: 'publicationDetails',
    title: 'Publication Details',
    fields: [
      { id: 'pubProjectTitle', label: 'Title of Project', type: 'text', required: true },
      { id: 'pubPaperTitle', label: 'Title of Paper', type: 'text', required: true },
      { id: 'pubConferenceJournalName', label: 'Name of Conference / Journal', type: 'text', required: true },
    ],
  },
  {
    id: 'signature',
    title: 'Signature by PI',
    fields: [
      { id: 'signaturePiName', label: 'Name of PI', type: 'text', required: true, maxWords: 150 },
      { id: 'signatureSchoolDept', label: 'School/Department', type: 'text', required: true },
      { id: 'signature', label: 'Signature', type: 'text', required: true, hint: 'Type your full name to sign.' },
      { id: 'piSubmissionDate', label: 'Date of Submission (PI)', type: 'display' },
    ],
  },
];
