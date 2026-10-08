/* Renders a horizontal progress stepper on a record's own page (IRPF,
 * IPAF, PCDF), showing where it currently sits in its review pipeline at
 * a glance -- a visual complement to the status badge (js/status.js),
 * which names the exact status but doesn't show how far along that is. */

const IRPF_IPAF_PIPELINE_STAGES = ['PI', 'Director', 'Secretariat', 'Members', 'Leadership', 'Outcome'];
const PCDF_PIPELINE_STAGES = ['PI', 'Director', 'Outcome'];

// Same roles the Activity Log already keeps to a limited view (see
// *_LIMITED_VISIBILITY_ROLES in irpf-page.js/ipaf-page.js/pcdf-page.js) --
// they never see the review process broken into Members vs Leadership, so
// the stepper collapses those two into one "Review" stage for them too.
const PIPELINE_LIMITED_VISIBILITY_ROLES = ['pi', 'sd-director', 'poc'];
const IRPF_IPAF_PIPELINE_STAGES_COLLAPSED = ['PI', 'Director', 'Secretariat', 'Review', 'Outcome'];

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
function getPipelineState(record, role) {
  const isPcdf = record.formType === 'PCDF';

  if (isPcdf) {
    // for_revision is PCDF's one return path -- the S/D Director is its
    // only possible reviewer, so unlike IRPF/IPAF there's no "how far did
    // it get" to work out: a return can only ever have come from the
    // Director stage.
    if (record.status === 'for_revision') {
      return { stages: PCDF_PIPELINE_STAGES, currentIndex: 0, returned: true, furthestIndex: 1 };
    }
    const index = { draft: 0, pending_director_approval: 1, approved: 2 }[record.status];
    return { stages: PCDF_PIPELINE_STAGES, currentIndex: index === undefined ? 0 : index, returned: false, furthestIndex: 0 };
  }

  const collapsed = PIPELINE_LIMITED_VISIBILITY_ROLES.includes(role);
  const stages = collapsed ? IRPF_IPAF_PIPELINE_STAGES_COLLAPSED : IRPF_IPAF_PIPELINE_STAGES;

  const statusIndex = collapsed
    ? {
        draft: 0,
        pending_director_approval: 1,
        pending_review: 2,
        under_review: 3,
        pending_leadership_approval: 3,
        approved: 4,
        to_create_ipaf: 4,
      }[record.status]
    : {
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

  // for_revision -- under either view, "reached Members" and "reached
  // Leadership" both collapse to the same "reached Review" point for a
  // limited-visibility viewer, since those are the same single stage to
  // them. The one case that never reached Secretariat at all is a Director
  // return straight off the PI's initial submission -- routedTo is still
  // 'sd-director' then, since nothing downstream has touched it yet.
  if (record.routedTo === 'sd-director') {
    return { stages, currentIndex: 0, returned: true, furthestIndex: 1 };
  }
  const reachedReview = (record.leadershipApprovals || []).length > 0 || (record.votes || []).length > 0;
  const furthestIndex = collapsed
    ? reachedReview
      ? 3
      : 2
    : (record.leadershipApprovals || []).length > 0
      ? 4
      : (record.votes || []).length > 0
        ? 3
        : 2;
  return { stages, currentIndex: 0, returned: true, furthestIndex };
}

function renderPipelineStepper(container, record, role) {
  if (!container) return;
  container.innerHTML = '';

  const { stages, currentIndex, returned, furthestIndex } = getPipelineState(record, role);

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
