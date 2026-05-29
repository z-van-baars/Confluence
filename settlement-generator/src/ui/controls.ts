import type { GenerationParameters } from '../core/types';
import { PARAMETER_DEFS, type ParameterDef } from '../core/parameters';

export type OnParameterChange = (params: GenerationParameters) => void;

export function buildControls(
  container: HTMLElement,
  params: GenerationParameters,
  onChange: OnParameterChange,
): { update: (params: GenerationParameters) => void } {
  container.innerHTML = '';
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();

  const sections = new Map<string, ParameterDef[]>();
  for (const def of PARAMETER_DEFS) {
    const list = sections.get(def.section) ?? [];
    list.push(def);
    sections.set(def.section, list);
  }

  for (const [sectionName, defs] of sections) {
    const section = document.createElement('div');
    section.className = 'control-section';

    const header = document.createElement('h3');
    header.textContent = sectionName;
    section.appendChild(header);

    for (const def of defs) {
      const group = createControl(def, params, (key, value) => {
        (params as unknown as Record<string, unknown>)[key] = value;
        onChange({ ...params });
      });
      section.appendChild(group.element);
      if (group.input) inputs.set(def.key, group.input);
    }

    container.appendChild(section);
  }

  return {
    update(newParams: GenerationParameters) {
      for (const [key, input] of inputs) {
        const val = (newParams as unknown as Record<string, unknown>)[key];
        if (input instanceof HTMLInputElement) {
          if (input.type === 'checkbox') {
            input.checked = val as boolean;
          } else {
            input.value = String(val);
          }
          const valueDisplay = input.parentElement?.querySelector('.value');
          if (valueDisplay) valueDisplay.textContent = formatValue(val);
        } else if (input instanceof HTMLSelectElement) {
          input.value = String(val);
        }
      }
    },
  };
}

interface ControlResult {
  element: HTMLElement;
  input: HTMLInputElement | HTMLSelectElement | null;
}

function createControl(
  def: ParameterDef,
  params: GenerationParameters,
  onChange: (key: string, value: unknown) => void,
): ControlResult {
  const group = document.createElement('div');
  group.className = 'control-group';

  const value = (params as unknown as Record<string, unknown>)[def.key];

  switch (def.type) {
    case 'seed': {
      const label = document.createElement('label');
      label.textContent = def.label;
      group.appendChild(label);

      const row = document.createElement('div');
      row.className = 'seed-input';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = String(value);
      input.addEventListener('change', () => {
        const num = parseInt(input.value, 10);
        if (!isNaN(num)) onChange(def.key, num);
      });

      const randomBtn = document.createElement('button');
      randomBtn.textContent = '\u{1F3B2}';
      randomBtn.title = 'Random seed';
      randomBtn.addEventListener('click', () => {
        const newSeed = Math.floor(Math.random() * 2147483647);
        input.value = String(newSeed);
        onChange(def.key, newSeed);
      });

      row.appendChild(input);
      row.appendChild(randomBtn);
      group.appendChild(row);
      return { element: group, input };
    }

    case 'slider': {
      const label = document.createElement('label');
      label.innerHTML = `${def.label} <span class="value">${formatValue(value)}</span>`;
      group.appendChild(label);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min ?? 0);
      input.max = String(def.max ?? 1);
      input.step = String(def.step ?? 0.01);
      input.value = String(value);

      input.addEventListener('input', () => {
        const num = parseFloat(input.value);
        const valueSpan = label.querySelector('.value');
        if (valueSpan) valueSpan.textContent = formatValue(num);
        onChange(def.key, num);
      });

      group.appendChild(input);
      return { element: group, input };
    }

    case 'select': {
      const label = document.createElement('label');
      label.textContent = def.label;
      group.appendChild(label);

      const select = document.createElement('select');
      for (const opt of def.options ?? []) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.value === String(value)) option.selected = true;
        select.appendChild(option);
      }

      select.addEventListener('change', () => {
        onChange(def.key, select.value);
      });

      group.appendChild(select);
      return { element: group, input: select };
    }

    case 'checkbox': {
      const label = document.createElement('label');
      label.className = 'checkbox-row';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = value as boolean;

      input.addEventListener('change', () => {
        onChange(def.key, input.checked);
      });

      label.appendChild(input);
      label.appendChild(document.createTextNode(def.label));
      group.appendChild(label);
      return { element: group, input };
    }
  }

  return { element: group, input: null };
}

function formatValue(val: unknown): string {
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(2);
  }
  return String(val);
}
