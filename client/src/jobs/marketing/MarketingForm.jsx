import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import {
  CUSTOMER_NAME_OPTIONS,
  INDUSTRY_OPTIONS,
  PANEL_NAME_OPTIONS,
  PANEL_TYPE_OPTIONS
} from '../jobDropdownOptions';
import { DEPARTMENT_USER_OPTIONS } from '../departmentUserOptions';

export default function MarketingForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.marketing || {}
  });

  useEffect(() => {
    if (job?.fields?.marketing) {
      reset(job.fields.marketing);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };



  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Marketing Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Name of Panel</label>
            <select {...register("Name of Panel")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              {PANEL_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Job No.</label>
            <input {...register("Job No.")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Qty.</label>
            <input {...register("Qty.")} type="number" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Type of Industries</label>
            <select {...register("Type of Industries")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              {INDUSTRY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Project Name</label>
            <input {...register("Project Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Customer Name</label>
            <select {...register("Customer Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              {CUSTOMER_NAME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Incomer Rating</label>
            <input {...register("Incomer Rating")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Type of Panel (TTA/NON TTA)</label>
            <select {...register("Type of Panel TTA/NON TTA")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              {PANEL_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Responsible Engg. Name</label>
            <select {...register("Responsible Engg. Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              {DEPARTMENT_USER_OPTIONS.marketing.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Purchase Order</label>
            <input {...register("Purchase Order")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Purchase Order Date</label>
            <input {...register("Purchase Order Date")} type="date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Delivery Period as per P.O</label>
            <input {...register("Delivery Period")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Delivery Date as per P.O.</label>
            <input {...register("Delivery Date")} type="date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Data Given To Design</label>
            <input {...register("Data Given To Design")} type="date" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Delivery Address</label>
            <input {...register("Delivery Address")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Contact Person & Ph. No.</label>
            <input {...register("Contact Person")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-gray-100">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium">Save Marketing Details</button>
        </div>
      </form>
    </div>
  );
}
