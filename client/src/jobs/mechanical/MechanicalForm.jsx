import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

export default function MechanicalForm({ job, onUpdate }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: job?.fields?.mechanical || {}
  });

  useEffect(() => {
    if (job?.fields?.mechanical) {
      reset(job.fields.mechanical);
    }
  }, [job, reset]);

  const onSubmit = (data) => {
    onUpdate(data);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-900">Mechanical / Fabricator / Assembly Department</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Drawing start Date</label>
            <input type="date" {...register("Drawing start Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Drawing Complete Date</label>
            <input type="date" {...register("Drawing Complete Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Drawing Prepare</label>
            <select {...register("Drawign Prepare")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="mechdesign1">mechdesign1</option>
              <option value="mechdesign2">mechdesign2</option>
              <option value="machinedesign">machinedesign</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Door and Service Plate</label>
            <input type="date" {...register("Door and Service Plate")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Drafting File Handover Date</label>
            <input type="date" {...register("Drafting File Handover Date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">DFT Prepare Engineer</label>
            <select {...register("DFT Prepare Engineer")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="mechdesign1">mechdesign1</option>
              <option value="mechdesign2">mechdesign2</option>
              <option value="machinedesign">machinedesign</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Release to programme</label>
            <input type="date" {...register("Release to programme")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Programme Start date</label>
            <input type="date" {...register("Programme Start date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Programme End date</label>
            <input type="date" {...register("Programme End date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Programmer Engineer Name</label>
            <select {...register("Programmer Engineer Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="mechdesign1">mechdesign1</option>
              <option value="mechdesign2">mechdesign2</option>
              <option value="machinedesign">machinedesign</option>
            </select>
          </div>
          
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Programming release to</label>
            <input type="text" {...register("Programming release to")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Punching & Laser Start</label>
            <input type="date" {...register("Puching & Laser Start")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Punching & Laser End</label>
            <input type="date" {...register("Puching & Laser End")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>

          <div className="col-span-1 md:col-span-2 lg:col-span-3 border-t my-4"></div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Bending start date</label>
            <input type="date" {...register("Bending start date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Bending complete</label>
            <input type="date" {...register("Bending complete")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Welding start date</label>
            <input type="date" {...register("Welding start date")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Welding complete</label>
            <input type="date" {...register("Welding complete")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Name of Fabricator</label>
            <input type="text" {...register("Name of Fabricator")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Name of Fabrication Engineer</label>
            <select {...register("Name of Fabrication Engineer")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="mechdesign1">mechdesign1</option>
              <option value="mechdesign2">mechdesign2</option>
              <option value="machinedesign">machinedesign</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Release to Painting</label>
            <input type="date" {...register("Release to Painting")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Recived to painting</label>
            <input type="date" {...register("Recived to painting")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Name of painter</label>
            <input type="text" {...register("Name of painter")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Panel Assembly Start</label>
            <input type="date" {...register("Panel Assembly Start")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Panel Assembly Complete</label>
            <input type="date" {...register("Panel Assembly Complete")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Name of Assembler</label>
            <input type="text" {...register("Name of Assembler")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Painting and Asembley Responsible Job engg.</label>
            <select {...register("Painting and Asembley Responsible Job engg. Name")} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white">
              <option value="">-- Select --</option>
              <option value="mechdesign1">mechdesign1</option>
              <option value="mechdesign2">mechdesign2</option>
              <option value="machinedesign">machinedesign</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end pt-4 border-t border-gray-200">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 font-medium">Save Mechanical Details</button>
        </div>
      </form>
    </div>
  );
}
