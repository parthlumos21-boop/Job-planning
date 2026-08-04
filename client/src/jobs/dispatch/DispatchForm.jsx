import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

export default function DispatchForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.dispatch || {}
  });

  useEffect(() => {
    if (job?.fields?.dispatch) {
      reset(job.fields.dispatch);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };

  const inputClass = "mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2.5 border bg-white";
  const labelClass = "block text-sm font-medium text-gray-700";

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-green-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-green-900">Dispatch Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <label className={labelClass}>Packing Start Date</label>
            <input type="date" {...register("Packing Start Date")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Packing Complete Date</label>
            <input type="date" {...register("Packing Complete Date")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Responsible Person Checked Before Packing</label>
            <input {...register("Name of Responsible Person Checked Before Packing")} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Dispatch Date</label>
            <input type="date" {...register("Dispatch Date")} className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button type="submit" className="bg-green-600 text-white px-4 py-2.5 rounded-lg shadow-sm hover:bg-green-700 font-medium transition-colors">
            Save Dispatch Details
          </button>
        </div>
      </form>
    </div>
  );
}
