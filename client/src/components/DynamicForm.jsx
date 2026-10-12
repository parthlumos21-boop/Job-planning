import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

export default function DynamicForm({ title, fieldsList, defaultValues, onSave }) {
  const { register, handleSubmit, reset } = useForm({
    defaultValues: defaultValues || {}
  });

  useEffect(() => {
    reset(defaultValues || {});
  }, [defaultValues, reset]);

  const onSubmit = (data) => {
    onSave(data);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {fieldsList.map((field) => {
            const isDate = field.toLowerCase().includes('date');
            return (
              <div key={field} className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">{field}</label>
                <input 
                  type={isDate ? 'date' : 'text'}
                  {...register(field)} 
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border bg-white text-slate-900" 
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-end pt-6 mt-6 border-t border-slate-100">
          <button type="submit" className="bg-blue-600 text-white px-5 py-2 rounded-md shadow-sm hover:bg-blue-700 font-medium transition-colors">
            Save Details
          </button>
        </div>
      </form>
    </div>
  );
}
