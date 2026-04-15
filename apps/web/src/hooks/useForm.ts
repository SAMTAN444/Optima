import { useState, ChangeEvent } from 'react';
import { ZodSchema } from 'zod';

type FormValues = Record<string, string>;

export function useForm<T extends FormValues>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setValues((prev: T) => ({ ...prev, [name]: value }));
    if (errors[name as keyof T]) {
      setErrors((prev: Partial<Record<keyof T, string>>) => ({ ...prev, [name]: undefined }));
    }
  };

  const setValue = (name: keyof T, value: string) => {
    setValues((prev: T) => ({ ...prev, [name]: value }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const validate = (schema: ZodSchema<any>): boolean => {
    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return true;
    }
    const fieldErrors: Partial<Record<keyof T, string>> = {};
    const flattened = result.error.flatten().fieldErrors as Record<string, string[]>;
    for (const [key, msgs] of Object.entries(flattened)) {
      if (msgs && msgs.length > 0) {
        fieldErrors[key as keyof T] = msgs[0];
      }
    }
    setErrors(fieldErrors);
    return false;
  };

  const reset = () => {
    setValues(initial);
    setErrors({});
  };

  return { values, errors, handleChange, setValue, validate, reset };
}
