import {type Page} from '@playwright/test';

/** Настоящий custom element: каждый экземпляр имеет собственные HTML ID и вложенный shadow root. */
export async function installShadowControls(
    page: Page,
    parent = '[data-testid="observed-page"]',
    id = 'shadow-fixture',
): Promise<void> {
    await page.evaluate(
        ({parent, id}) => {
            if (!customElements.get('observer-test-controls')) {
                customElements.define(
                    'observer-test-controls',
                    class extends HTMLElement {
                        constructor() {
                            super();
                            this.attachShadow({mode: 'open'}).innerHTML = `
                        <style>
                            :host { display:block; position:fixed; left:20px; top:150px; z-index:200; background:white; padding:8px; }
                            input, button, textarea { display:block; margin:4px; }
                        </style>
                        <span id="name-label">Shadow name</span>
                        <input id="shadow-name" aria-labelledby="name-label">
                        <textarea id="shadow-note" aria-label="Shadow note"></textarea>
                        <button id="shadow-action">Shadow action</button>
                        <input id="shadow-secret" type="password" value="shadow-private-value">
                        <input id="shadow-choice" tuiComboBox role="combobox" aria-haspopup="listbox" aria-expanded="true" aria-controls="choices">
                        <div id="choices" role="listbox"><div role="option" aria-selected="true">Local choice</div></div>
                        <div id="nested-host"></div>
                        <div id="slot-wrapper"><slot><button id="fallback-action">Fallback</button></slot></div>
                        Shadow root text
                    `;
                            this.shadowRoot!.querySelector('#nested-host')!.attachShadow({
                                mode: 'open',
                            }).innerHTML =
                                '<button id="nested-action">Nested action</button>';
                        }
                    },
                );
            }

            const host = document.createElement('observer-test-controls');

            host.id = id;
            host.innerHTML = '<button id="slotted-action">Slotted action</button>';
            document.querySelector(parent)!.append(host);
        },
        {parent, id},
    );
}
