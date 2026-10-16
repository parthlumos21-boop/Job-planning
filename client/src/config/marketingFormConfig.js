// Configuration & Modular Helpers for Marketing Workflow & Role Management

export const TRANSPORT_OPTIONS = ['Inclusive', 'Exclusive', 'Others'];
export const PACKING_OPTIONS = ['Polythene', 'Crate Wooden', 'Sea Worthy', 'Export', 'Others'];

/**
 * Checks if a user is part of the Marketing Department or holds marketing administrative rights.
 * Avoids hardcoding usernames like 'swatisales'.
 */
export const isMarketingUser = (user) => {
  if (!user) return false;
  const username = (user.username || user.name || '').trim().toLowerCase();
  const depts = (user.departments || []).map(d => String(d).toLowerCase());
  const role = (user.role || '').toLowerCase();
  return (
    depts.includes('marketing') ||
    role === 'mktadmin' ||
    role === 'marketing_lead' ||
    username.startsWith('swatisales') ||
    username === 'mktadmin'
  );
};

/**
 * Extensible Marketing Lead Check:
 * Matches 'mktadmin', 'marketing_lead', or explicit lead flag.
 * Any user can be designated as marketing lead/admin without code changes.
 */
export const isMarketingLead = (user) => {
  if (!user) return false;
  const role = (user.role || '').toLowerCase();
  return role === 'mktadmin' || role === 'marketing_lead' || Boolean(user.is_lead);
};

/**
 * Formats Job Number cleanly without '#' prefix, preserving database values.
 * Example: '#45' -> '45', '45' -> '45'
 */
export const cleanJobNo = (jobNo) => {
  if (!jobNo) return '';
  return String(jobNo).replace(/^#+/, '').trim();
};

/**
 * Extracts and formats explicit handover accountability information.
 */
export const getHandoverAccountability = (job) => {
  if (!job) return null;
  const checklist = job.handoverChecklist || {};
  const submittedBy = job.handoverSubmittedBy || checklist.submitted_by || checklist.submittedBy || '';
  const submittedAt = job.handoverSubmittedAt || checklist.submitted_at || checklist.submittedAt || '';
  const toDept = job.targetDepartment || checklist.target_department || 'design';
  const notes = job.handoverNotes || checklist.notes || '';

  if (!submittedBy && !submittedAt && !job.handoverStatus) return null;

  return {
    submittedBy: submittedBy || 'Marketing Team',
    submittedAt: submittedAt ? new Date(submittedAt).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : '',
    toDept: toDept.charAt(0).toUpperCase() + toDept.slice(1),
    notes
  };
};
