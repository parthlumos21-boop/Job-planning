import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

export default function ProductionForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.production || {}
  });

  useEffect(() => {
    if (job?.fields?.production) {
      reset(job.fields.production);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Production, QC & Dispatch Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-8 bg-gray-50">
        
        {/* Production & QC */}
        <div className="border border-gray-200 rounded-md p-4 bg-white space-y-4">
          <h4 className="font-bold text-gray-800">Production & QC Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Responsible Job engg. Name</label>
              <select {...register("Responsible Job Engineer")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Busbar Work Start Date</label>
              <input type="date" {...register("Busbar Work Start Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Busbar Work Complete Date</label>
              <input type="date" {...register("Busbar Work Complete Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Responsible Fitter</label>
              <select {...register("Responsible Fitter")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Wiring Start Date</label>
              <input type="date" {...register("Wiring Start Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Wiring Complete Date</label>
              <input type="date" {...register("Wiring Complete Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Responsible Wireman</label>
              <select {...register("Responsible Wireman")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Testing Start Date</label>
              <input type="date" {...register("Testing Start Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Testing Complete Date</label>
              <input type="date" {...register("Testing Complete Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Testing Done By Engineer</label>
              <select {...register("Testing Done By Engineer")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Actual Inspection Date</label>
              <input type="date" {...register("Actual Inspection Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Compliance / Dispatch Clearance Date</label>
              <input type="date" {...register("Compliance / Dispatch Clearance Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built Submission Date</label>
              <input type="date" {...register("As Built Submission Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built Prepared By (Production)</label>
              <select {...register("As Built Prepared By Engineer (Production)")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">As Built PDF Prepared By (Design)</label>
              <select {...register("As Built PDF Prepared By Engineer (Design)")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatidesign">swatidesign</option>
                <option value="swatidesign2">swatidesign2</option>
                <option value="designadmin">designadmin</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dispatch */}
        <div className="border border-gray-200 rounded-md p-4 bg-white space-y-4">
          <h4 className="font-bold text-gray-800">Dispatch Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Packing Start Date</label>
              <input type="date" {...register("Packing Start Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Packing Complete Date</label>
              <input type="date" {...register("Packing Complete Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Responsible Person Checked</label>
              <select {...register("Name of Responsible Person Checked Before Packing")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
                <option value="">-- Select --</option>
                <option value="swatiproduction">swatiproduction</option>
                <option value="swatiqc">swatiqc</option>
                <option value="prodadmin">prodadmin</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Dispatch Date</label>
              <input type="date" {...register("Dispatch Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium">Save Production Details</button>
        </div>
      </form>
    </div>
  );
}
