import type { RenderLayer } from '../core/types';

export type OnLayerChange = (layers: RenderLayer[]) => void;

export function buildLayersPanel(
  container: HTMLElement,
  layers: RenderLayer[],
  onChange: OnLayerChange,
): { update: (layers: RenderLayer[]) => void } {
  const render = (currentLayers: RenderLayer[]) => {
    container.innerHTML = '';

    const header = document.createElement('h3');
    header.textContent = 'Layers';
    container.appendChild(header);

    for (const layer of currentLayers) {
      const toggle = document.createElement('label');
      toggle.className = 'layer-toggle';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = layer.visible;

      checkbox.addEventListener('change', () => {
        layer.visible = checkbox.checked;
        onChange([...currentLayers]);
      });

      toggle.appendChild(checkbox);
      toggle.appendChild(document.createTextNode(layer.name));
      container.appendChild(toggle);
    }
  };

  render(layers);

  return {
    update(newLayers: RenderLayer[]) {
      render(newLayers);
    },
  };
}
