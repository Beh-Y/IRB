/* Field/section definitions for the IRPF, transcribed from the IRPF spec (incl. Annex A). */

const ANNEX_A = {
  methodology:
    'Please follow the guiding questions below and elaborate your methodology accordingly. ' +
    'How are you selecting and/or inviting the human subjects to the study? What are the inclusion and exclusion criteria? ' +
    'What are the age range and number of human subjects involved? Would the human subjects be free to choose to participate ' +
    'in the study or not? Would the human subjects have any special condition(s) or vulnerabilities (e.g., illness, cognitive ' +
    'disability, physical disability, special education need, etc)? What are the nature and types of intervention/interaction ' +
    '(e.g., physical procedure, exposure to specific product or process or environmental condition, simulated scenario, ' +
    'questionnaire, observation, interview, focus group discussion, etc)? What are the types of biological materials, health ' +
    'or physiological information collected? What are the types of data collected (e.g., personal identifiers, written ' +
    'responses, test results, video recordings, conversation transcripts, etc)? How would you handle the data of the ' +
    'participants (e.g., storage, processing, accessibility control and protection)?',
  appendix:
    'Supporting information such as: informed consent form (e.g. human subjects are not SP PET/CET students), introductory ' +
    'message for the potential participants, questions to be used for survey, questionnaire, interview, or focus group discussion.',
  ethics:
    'If PI has acquired prior knowledge on research ethics, please describe the courses or experiences which provided the ' +
    'prior knowledge (e.g., valid CITI Program certificate(s) obtained in SP or other institutes/organizations, experience in ' +
    'postgraduate research involving human subjects, training certificate obtained for research ethics course, served or ' +
    'serving as IRB/IRB Sub-Committee Member in SP or other institutes/organizations, etc). Otherwise, PI is expected to ' +
    'complete the Ethics module hosted on SP Learning Management System. PI is required to complete an online quiz as a ' +
    'verification of understanding research ethics considerations. Please insert a screenshot of passing the online quiz here.',
  titleOfPaper:
    'Please provide information below on Title of Paper and Name of Conference/Journal. If you are uncertain about the ' +
    'Title of Paper and/or Name of Conference/Journal, you may indicate as "TBC".',
};

/* True once any Section 1B nature-of-research question is answered "Yes". */
function section1BAnyYes(data) {
  return (
    data.involvesHumanSubjects === 'Yes' ||
    data.involvesBiologicalMaterials === 'Yes' ||
    data.involvesHealthInfo === 'Yes'
  );
}

const FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png';

const IRPF_SCHEMA = [
  {
    id: 'header',
    title: 'IRPF Reference Number',
    fields: [{ id: 'refNumber', label: 'IRPF Reference Number', type: 'display' }],
  },
  {
    id: 'project-details',
    title: 'Project Details',
    fields: [
      { id: 'projectTitle', label: 'Project Title', type: 'text', required: true, maxWords: 100 },
      { id: 'schoolDepartment', label: 'School / Department', type: 'text', required: true, maxWords: 100 },
      {
        id: 'projectStartDate',
        label: 'Project Start Date',
        type: 'date',
        required: true,
        hint: 'Must be after the date the form was filled.',
        validate: (value, data, record) => {
          if (!value) return null;
          const basis = record && record.createdAt ? new Date(record.createdAt) : new Date();
          basis.setHours(0, 0, 0, 0);
          if (new Date(value) <= basis) return 'Project Start Date must be after the date the form was filled.';
          return null;
        },
      },
      {
        id: 'projectEndDate',
        label: 'Project End Date',
        type: 'date',
        required: true,
        hint: 'Must be after Project Start Date.',
        validate: (value, data) => {
          if (!value || !data.projectStartDate) return null;
          if (new Date(value) <= new Date(data.projectStartDate)) return 'Project End Date must be after Project Start Date.';
          return null;
        },
      },
    ],
  },
  {
    id: 'section1',
    title: 'Section 1 – Particulars of Research',
    fields: [
      {
        id: 'categoryOfResearch',
        label: 'Category of Research',
        type: 'radio',
        required: true,
        options: ['Educational Research', 'Biomedical Research', 'Others'],
        info: '"Others" e.g., food, cosmetics, social & behavioural, digital technologies, etc',
      },
      {
        id: 'categoryOthersSpecify',
        label: 'Category – Others (specify)',
        type: 'text',
        maxWords: 100,
        visibleIf: (d) => d.categoryOfResearch === 'Others',
        requiredIf: (d) => d.categoryOfResearch === 'Others',
      },
    ],
  },
  {
    id: 'section1b',
    title: 'Section 1B – Nature of Research',
    fields: [
      { id: 'involvesHumanSubjects', label: 'Involves Human Subjects', type: 'yesno', required: true },
      { id: 'involvesBiologicalMaterials', label: 'Involves Biological Materials', type: 'yesno', required: true },
      { id: 'involvesHealthInfo', label: 'Involves Health or Physiological Information', type: 'yesno', required: true },
    ],
  },
  {
    id: 'section2',
    title: 'Section 2 – Project Description',
    fields: [
      { id: 'synopsisObjective', label: 'Synopsis and Objective', type: 'textarea', required: true, maxWords: 300 },
      { id: 'industryCollaboration', label: 'Collaboration with Industry or Financial Support', type: 'yesno', required: true },
      {
        id: 'industryCollaborationDetails',
        label: 'Details of Collaboration with Industry or Financial Support',
        type: 'textarea',
        visibleIf: (d) => d.industryCollaboration === 'Yes',
        requiredIf: (d) => d.industryCollaboration === 'Yes',
      },
      {
        id: 'involvesOtherSchoolCollab',
        label: 'Does research project involve collaboration with other school(s) or research institute(s)?',
        type: 'yesno',
        visibleIf: section1BAnyYes,
        requiredIf: section1BAnyYes,
      },
      {
        id: 'otherIrbApprovalObtained',
        label: 'Is approval of research project obtained from IRB of other school(s) or research institute(s)?',
        type: 'yesno',
        visibleIf: (d) => d.involvesOtherSchoolCollab === 'Yes',
        requiredIf: (d) => d.involvesOtherSchoolCollab === 'Yes',
      },
      {
        id: 'collaboratingSchoolName',
        label: 'Name of Collaborating School/Institute',
        type: 'text',
        maxWords: 100,
        visibleIf: (d) => d.otherIrbApprovalObtained === 'Yes',
        requiredIf: (d) => d.otherIrbApprovalObtained === 'Yes',
      },
      {
        id: 'externalPiName',
        label: 'Name of External PI',
        type: 'text',
        maxWords: 100,
        visibleIf: (d) => d.otherIrbApprovalObtained === 'Yes',
        requiredIf: (d) => d.otherIrbApprovalObtained === 'Yes',
      },
      {
        id: 'externalIrbApprovalDate',
        label: 'Date of External IRB Approval',
        type: 'date',
        visibleIf: (d) => d.otherIrbApprovalObtained === 'Yes',
        requiredIf: (d) => d.otherIrbApprovalObtained === 'Yes',
      },
      {
        id: 'methodology',
        label: 'Methodology',
        type: 'textarea',
        maxWords: 10000,
        info: ANNEX_A.methodology,
        visibleIf: section1BAnyYes,
        requiredIf: section1BAnyYes,
      },
      {
        id: 'appendixDocs',
        label: 'Appendix / Supporting Documents',
        type: 'file',
        multiple: true,
        accept: FILE_ACCEPT,
        info: ANNEX_A.appendix,
        visibleIf: section1BAnyYes,
        requiredIf: section1BAnyYes,
      },
      {
        id: 'ethicsKnowledgeDocs',
        label: 'Knowledge of Research Ethics',
        type: 'file',
        multiple: true,
        accept: FILE_ACCEPT,
        info: ANNEX_A.ethics,
        visibleIf: section1BAnyYes,
        requiredIf: section1BAnyYes,
      },
    ],
  },
  {
    id: 'section3',
    title: 'Section 3 – Declaration',
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
        id: 'declHonesty',
        label: 'I hereby declare that I shall maintain honesty in data collection, analysis, and reporting in my project/research.',
        type: 'yesna',
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
        mustEqual: 'Yes',
      },
      { id: 'intentionToPublish', label: 'Intention to Publish/Present', type: 'yesno', required: true },
      {
        id: 'titleOfPaper',
        label: 'Title of Paper',
        type: 'text',
        maxChars: 300,
        info: ANNEX_A.titleOfPaper,
        visibleIf: (d) => d.intentionToPublish === 'Yes',
        requiredIf: (d) => d.intentionToPublish === 'Yes',
      },
      {
        id: 'conferenceJournalName',
        label: 'Name of Conference / Journal',
        type: 'text',
        maxChars: 300,
        info: ANNEX_A.titleOfPaper,
        visibleIf: (d) => d.intentionToPublish === 'Yes',
        requiredIf: (d) => d.intentionToPublish === 'Yes',
      },
      { id: 'coPiNames', label: 'Name(s) of Co-PI(s) / Project Team Members', type: 'textarea', maxWords: 150 },
    ],
  },
  {
    id: 'section4',
    title: 'Section 4 – Signatures',
    fields: [
      { id: 'piName', label: 'Name of PI', type: 'text', required: true, maxWords: 150 },
      { id: 'piSchoolDept', label: 'School / Department / Centre (PI)', type: 'text', required: true, maxWords: 150 },
      { id: 'piSubmissionDate', label: 'Date of Submission (PI)', type: 'display', hint: 'Captured automatically when the PI submits.' },
      { id: 'directorName', label: 'Name of Director (Endorser)', type: 'text', required: true, maxWords: 150 },
      { id: 'directorSchoolDept', label: 'School / Department / Centre (Director)', type: 'text', required: true, maxWords: 150 },
      { id: 'directorApprovalDate', label: 'Date (Director)', type: 'display', hint: 'Captured automatically when the Director approves.' },
    ],
  },
];
