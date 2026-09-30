/* Renders a horizontal progress stepper on a record's own page (IRPF,
 * IPAF, PCDF), showing where it currently sits in its review pipeline at
 * a glance -- a visual complement to the status badge (js/status.js),
 * which names the exact status but doesn't show how far along that is. */

const IRPF_IPAF_PIPELINE_STAGES = ['PI', 'Director', 'Secretariat', 'Members', 'Leadership', 'Outcome'];
const PCDF_PIPELINE_STAGES = ['PI', 'Director', 'Outcome'];

/* Maps a record's status to { stages, currentIndex, returned, furthestIndex }.
 * 'for_revision' is the one status that doesn't map onto a single forward
 * step -- it can be returned from Secretariat triage, the Member panel, or
 * Leadership approval, sending it back to the PI regardless of how far it
 * had gotten. Rather than losing that progress, the record's own votes/
 * leadershipApprovals (which a return doesn't clear) say how far it
 * actually got: leadership approvals present means it was returned from
 * Leadership, member votes present (with none from Leadership) means the
 * Member panel, otherwise Secretariat triage -- the earliest point a
 * return can happen from. Those earlier stages still show complete; only
 * the PI's own step re-highlights as the current (and returned) one. */
function getPipelineState(record) {
  const isPcdf = record.formType === 'PCDF';
  const stages = isPcdf ? PCDF_PIPELINE_STAGES : IRPF_IPAF_PIPELINE_STAGES;

  if (isPcdf) {
    const index = { draft: 0, pending_director_approval: 1, approved: 2 }[record.status];
    return { stages, currentIndex: index === undefined ? 0 : index, returned: false, furthestIndex: 0 };
  }

  const statusIndex = {
    draft: 0,
    pending_director_approval: 1,
    pending_review: 2,
    under_review: 3,
    pending_leadership_approval: 4,
    approved: 5,
    to_create_ipaf: 5,
  }[record.status];

  if (statusIndex !== undefined) {
    return { stages, currentIndex: statusIndex, returned: false, furthestIndex: 0 };
  }

  // for_revision
  const furthestIndex = (record.leadershipApprovals || []).length > 0 ? 4 : (record.votes || []).length > 0 ? 3 : 2;
  return { stages, currentIndex: 0, returned: true, furthestIndex };
}

function renderPipelineStepper(container, record) {
  if (!container) return;
  container.innerHTML = '';

  const { stages, currentIndex, returned, furthestIndex } = getPipelineState(record);

  stages.forEach((label, i) => {
    const step = document.createElement('div');
    let state;
    if (returned) {
      state = i === 0 ? 'returned' : i <= furthestIndex ? 'complete' : 'upcoming';
    } else if (i === currentIndex && i === stages.length - 1) {
      // Reaching the final stage (Outcome) means the whole pipeline is
      // done, not "in progress" -- show it complete, same as any earlier
      // stage already passed, rather than the "current" highlight a
      // mid-pipeline stage gets while still awaiting someone's action.
      state = 'complete';
    } else {
      state = i < currentIndex ? 'complete' : i === currentIndex ? 'current' : 'upcoming';
    }
    step.className = `pipeline-step pipeline-step--${state}`;

    const dot = document.createElement('div');
    dot.className = 'pipeline-step-dot';
    dot.textContent = state === 'complete' ? '✓' : String(i + 1);
    step.appendChild(dot);

    const stepLabel = document.createElement('div');
    stepLabel.className = 'pipeline-step-label';
    stepLabel.textContent = returned && i === 0 ? 'PI (Returned)' : label;
    step.appendChild(stepLabel);

    container.appendChild(step);
  });
}
