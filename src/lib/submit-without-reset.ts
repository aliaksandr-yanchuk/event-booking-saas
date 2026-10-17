import { startTransition, type FormEvent } from "react";

/**
 * onSubmit handler that dispatches a form action without React's automatic
 * form reset.
 *
 * React resets a <form action={…}> after the action finishes. When the action
 * returns validation errors, that wipes what the user typed, and it unchecks
 * controlled checkboxes while their React state still says "checked".
 * Keep `action={dispatch}` on the form as well: without JavaScript, the browser
 * still posts the form to the server action.
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
