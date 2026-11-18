(() => {
  'use strict';

  // Eliminadas las cajas y textos de ayuda intrusivos (.usage-guide, .dialog-guidance, .field-guidance)
  // en todas las pantallas según requerimiento del sistema.

  // Soporte de validación de campos nativos
  document.addEventListener('invalid', e => {
    const input = e.target;
    if (!input.matches('input,select,textarea')) return;
    const validity = input.validity;
    const text = validity.valueMissing
      ? (input.tagName === 'SELECT' ? 'Selecciona una opción para continuar.' : 'Completa este campo para continuar.')
      : validity.badInput
      ? 'Escribe un número válido.'
      : validity.rangeUnderflow
      ? `El valor mínimo es ${input.min}.`
      : validity.rangeOverflow
      ? `El valor máximo es ${input.max}.`
      : validity.stepMismatch
      ? (input.type === 'time' ? 'Selecciona una hora entre las opciones permitidas.' : input.step === '0.01' ? 'Escribe el importe con un máximo de dos decimales.' : 'Revisa el valor; utiliza los incrementos indicados en este campo.')
      : validity.typeMismatch
      ? 'Revisa el formato de este dato.'
      : 'Revisa este campo antes de continuar.';

    let error = input.parentElement?.querySelector('.usage-field-error');
    if (!error) {
      error = document.createElement('small');
      error.className = 'usage-field-error';
      error.setAttribute('role', 'alert');
      input.after(error);
    }
    error.textContent = text;
    input.setAttribute('aria-invalid', 'true');
  }, true);

  document.addEventListener('input', e => {
    const input = e.target;
    if (input.hasAttribute('aria-invalid') && input.validity?.valid) {
      input.removeAttribute('aria-invalid');
      input.parentElement?.querySelector('.usage-field-error')?.remove();
    }
  });

  document.addEventListener('reset', e => {
    e.target.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
    e.target.querySelectorAll('.usage-field-error').forEach(error => error.remove());
  }, true);
})();
