function userDepartments(user) {
  return Array.isArray(user?.departments) ? user.departments : [];
}

function isMarketing(user) {
  return user?.role === "user" && userDepartments(user).includes("marketing");
}

function canManageJobCore(user) {
  const allowedUsers = ['keval v shah', 'swatisales', 'swatisales2', 'mktadmin'];
  const username = user?.username?.toLowerCase() || '';

  return user?.role === "admin" || 
         user?.role === "executive" || 
         user?.username === "designadmin" || 
         userDepartments(user).includes("marketing") ||
         allowedUsers.includes(username);
}

function visibleDepartmentsForJob(job) {
  const visible = new Set();

  if (job?.targetDepartment) visible.add(job.targetDepartment);
  if (Array.isArray(job?.visibleToDepartments)) {
    job.visibleToDepartments.forEach((d) => d && visible.add(d));
  }

  Object.entries(job?.fields || {}).forEach(([dept, fields]) => {
    if (fields && Object.keys(fields).length > 0) visible.add(dept);
  });

  Object.entries(job?.engineers || {}).forEach(([dept, names]) => {
    if (Array.isArray(names) && names.length > 0) visible.add(dept);
  });

  return Array.from(visible);
}

function canViewJob(user, job, department) {
  if (user?.role === "admin" || user?.role === "executive") return true;

  const allowedUsers = ['keval v shah', 'swatisales', 'swatisales2', 'mktadmin'];
  const username = user?.username?.toLowerCase() || '';
  if (allowedUsers.includes(username)) return true;

  const allowed = userDepartments(user);
  if (department && !allowed.includes(department)) return false;

  const visible = visibleDepartmentsForJob(job);
  if (department) return visible.includes(department);
  return allowed.some((dept) => visible.includes(dept));
}

module.exports = {
  canManageJobCore,
  canViewJob,
  isMarketing,
  userDepartments,
  visibleDepartmentsForJob,
};
