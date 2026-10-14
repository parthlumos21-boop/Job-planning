/**
 * Centralized Workflow & Permissions Policy
 * Fully configurable and changeable without rewriting component code or backend endpoints.
 */
export const WORKFLOW_CONFIG = {
  // Department & Job Permissions
  allowAllCreateJob: true,              // All departments (Marketing, Design, Planning, Procurement, Production, QC) can create jobs
  allowAllAssignResponsibleEngg: true,  // All departments can assign or change the Responsible Engineer
  allowAllSubmitHandover: true,         // All departments can submit handovers across stages
  allowAllAcceptReturnHandover: true,   // All departments can review, accept, or return handovers
  allowAllAssignPlanningOwner: true,    // All departments can assign or reassign the Planning Owner
  allowAllCompletePlanningStage: true,  // All departments can finalize planning milestones and forward to Design

  // Quality & Audit Guardrails
  requireReturnReason: true,            // Mandatory reason (minimum 5 characters) when returning handovers
  minReturnReasonLength: 5,

  // Department Display Colors & Labels
  departments: {
    marketing: { label: 'Marketing', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-300' },
    planning: { label: 'Planning', color: 'bg-blue-500/10 text-blue-700 border-blue-300' },
    design: { label: 'Design- Electrical', color: 'bg-indigo-500/10 text-indigo-700 border-indigo-300' },
    mechanical: { label: 'Design- Mechanical', color: 'bg-purple-500/10 text-purple-700 border-purple-300' },
    purchase: { label: 'Procurement', color: 'bg-amber-500/10 text-amber-700 border-amber-300' },
    production: { label: 'Production', color: 'bg-rose-500/10 text-rose-700 border-rose-300' },
    dispatch: { label: 'Dispatch', color: 'bg-teal-500/10 text-teal-700 border-teal-300' }
  },

  // Handover Status Badge Colors
  statusBadges: {
    'Draft': 'bg-slate-100 text-slate-700 border-slate-300',
    'Submitted for Planning': 'bg-blue-50 text-blue-700 border-blue-300 animate-pulse',
    'Pending Planning Review': 'bg-amber-50 text-amber-700 border-amber-300',
    'Accepted': 'bg-emerald-50 text-emerald-700 border-emerald-300',
    'Returned for Correction': 'bg-rose-50 text-rose-700 border-rose-300',
    'Planning In Progress': 'bg-indigo-50 text-indigo-700 border-indigo-300',
    'Planning Completed': 'bg-teal-50 text-teal-700 border border-teal-300',
    'Forwarded to Design': 'bg-violet-50 text-violet-700 border border-violet-300',
  }
};

export function getHandoverBadge(status) {
  const map = {
    'submitted': { label: 'Submitted to Planning', color: 'bg-amber-50 text-amber-700 border border-amber-300', dot: 'bg-amber-500' },
    'accepted': { label: 'Planning Accepted', color: 'bg-emerald-50 text-emerald-700 border border-emerald-300', dot: 'bg-emerald-500' },
    'returned': { label: 'Returned for Correction', color: 'bg-rose-50 text-rose-700 border border-rose-300', dot: 'bg-rose-500' },
    'in_progress': { label: 'Planning In Progress', color: 'bg-blue-50 text-blue-700 border border-blue-300', dot: 'bg-blue-500' },
    'completed': { label: 'Planning Completed', color: 'bg-teal-50 text-teal-700 border border-teal-300', dot: 'bg-teal-500' },
    'forwarded_design': { label: 'Forwarded to Design', color: 'bg-violet-50 text-violet-700 border border-violet-300', dot: 'bg-violet-500' },
    'draft': { label: 'Draft', color: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400' }
  };
  return map[status] || { label: status || 'Draft', color: 'bg-slate-100 text-slate-600 border border-slate-200', dot: 'bg-slate-400' };
}

