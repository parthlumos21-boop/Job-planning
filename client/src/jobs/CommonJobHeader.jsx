export default function CommonJobHeader({ job }) {
  const mf = job?.fields?.marketing || {};

  const fields = [
    { label: 'Job No.', value: job?.jobNo },
    { label: 'Name of Panel', value: job?.panelName },
    { label: 'Qty', value: job?.qty },
    { label: 'Type of Industries', value: job?.typeOfIndustries },
    { label: 'Project Name', value: job?.projectName },
    { label: 'Incomer Rating', value: job?.incomerRating },
    { label: 'Type of Panel', value: job?.typeOfPanel },
    { label: 'Responsible Engg. Name', value: job?.responsibleEnggName },
    { label: 'Purchase Order No.', value: job?.poNo },
    { label: 'Purchase Order Date', value: job?.poDate },
    { label: 'Delivery Period as per P.O.', value: job?.deliveryPeriod },
    { label: 'Delivery Date as per P.O.', value: job?.deliveryDate },
    { label: 'Data Given To Design', value: job?.dataGivenToDesign },
    { label: 'Delivery Address', value: job?.deliveryAddress },
    { label: 'Contact Person & Ph. No.', value: job?.contactPerson },
    { label: 'Client Name', value: job?.clientName },
  ];

  return (
    <div className="bg-slate-900 rounded-lg shadow-md overflow-hidden border border-slate-800">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-950">
        <h2 className="text-xl font-bold text-white">Job Information</h2>
        <p className="text-slate-400 text-sm mt-1">Common details — read-only for all departments</p>
      </div>
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{f.label}</div>
            <div className="mt-1 text-white font-medium text-sm">{f.value || '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
