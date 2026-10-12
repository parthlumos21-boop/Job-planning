import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { DEPARTMENT_USER_OPTIONS } from '../departmentUserOptions';

export default function ElectricalForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.design || {}
  });

  useEffect(() => {
    if (job?.fields?.design) {
      reset(job.fields.design);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };

  const renderRevisionBlock = (rev) => (
    <div className="border border-gray-200 rounded-md p-4 bg-white space-y-4">
      <h4 className="font-bold text-gray-800">Revision {rev}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['GA', 'SLD', 'BOQ', 'CONTROL', 'PDF'].map(type => (
          <div key={`${rev}-${type}`} className="space-y-2 p-3 bg-gray-50 rounded border border-gray-100">
            <h5 className="font-semibold text-sm text-gray-700">{type} Submission</h5>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Start Date</label>
              <input type="date" {...register(`Rev ${rev} ${type} START DATE`)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-2 py-1 border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">End Date</label>
              <input type="date" {...register(`Rev ${rev} ${type} END DATE`)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-2 py-1 border" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Engineer Name</label>
              <select {...register(`Rev ${rev} ${type} Name of Person`)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-2 py-1.5 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
        <div className="space-y-2 p-3 bg-gray-50 rounded border border-gray-100">
          <h5 className="font-semibold text-sm text-gray-700">Client Submission</h5>
          <div className="space-y-1">
            <label className="text-xs text-gray-500">Date</label>
            <input type="date" {...register(`CLIENT SUBMISSION DATE R${rev}`)} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-2 py-1 border" />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Design - Electrical Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 bg-gray-50">
        
        {/* Revisions */}
        <div className="space-y-6">
          {renderRevisionBlock('R0')}
          {renderRevisionBlock('R1')}
          {renderRevisionBlock('R2')}
        </div>

        {/* Final Details */}
        <div className="border border-gray-200 rounded-md p-4 bg-white space-y-4">
          <h4 className="font-bold text-gray-800">Final Release Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Final Approved Drawings Received</label>
              <input type="date" {...register("Final Approved Drawings Received Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">BOM Released To ERP System</label>
            <input type="date" {...register("BOM Released To ERP System")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">SO No. of ERP System</label>
              <input type="text" {...register("SO No. of ERP System")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">BOM Prepare Engnieer Name</label>
              <select {...register("BOM Prepare Engnieer Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Fabrication Release Date</label>
              <input type="date" {...register("Fabrication Release Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Swati / Outsource</label>
            <select {...register("Swati / Outsource")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="Swati">Swati</option>
              <option value="Outsource">Outsource</option>
            </select>
          </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Fabrication Prepare Engnieer Name</label>
              <select {...register("Fabrication Prepare Engnieer Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Door Details Sent Date</label>
              <input type="date" {...register("Door Details Sent Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Door Details Prepare Engineer</label>
              <select {...register("Door Details Prepare Engineer Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Execution File Date</label>
              <input type="date" {...register("Execution File Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Execution (PDF)</label>
              <input type="date" {...register("Execution (PDF)")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built Submission</label>
              <input type="date" {...register("As Built Submission")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built Prepared By</label>
              <select {...register("As Built Prepared By")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built (PDF) Prepared By</label>
              <select {...register("As Built (PDF) Prepared By")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                {DEPARTMENT_USER_OPTIONS.design.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button type="submit" className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm">
            Save Electrical Details
          </button>
        </div>
      </form>
    </div>
  );
}
