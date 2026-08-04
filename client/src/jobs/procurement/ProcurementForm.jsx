import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

export default function ProcurementForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.purchase || {}
  });

  useEffect(() => {
    if (job?.fields?.purchase) {
      reset(job.fields.purchase);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Procurement Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Switchgear PO Number</label>
            <input type="text" {...register("Switchgear PO Number")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Switchgear Date</label>
            <input type="date" {...register("Switchgear Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Misc PO Number</label>
            <input type="text" {...register("Misc PO Number")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Misc Date</label>
            <input type="date" {...register("Misc Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium">Save Procurement Details</button>
        </div>
      </form>
    </div>
  );
}
