export default function StatusBadge({ status }) {
  const styles = {
    'pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'in-progress': 'bg-blue-100 text-blue-800 border-blue-200',
    'completed': 'bg-green-100 text-green-800 border-green-200',
  };

  const labels = {
    'pending': 'Pending',
    'in-progress': 'In Progress',
    'completed': 'Completed',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
      {labels[status] || 'Pending'}
    </span>
  );
}
