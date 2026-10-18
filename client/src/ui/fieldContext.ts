import { createContext } from 'react';

/** Provided by <Field>: lets controls label themselves and show the error state. */
export const FieldContext = createContext<{ labelId: string; invalid: boolean } | null>(null);
