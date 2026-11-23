document.addEventListener("DOMContentLoaded", () => {
    includeHTML();
});

async function includeHTML() {
    const elements = document.querySelectorAll("[data-include-html]");

    for (const el of elements) {
        const file = el.getAttribute("data-include-html");

        try {
            const response = await fetch(file);

            if (!response.ok) {
                throw new Error(`Failed to load ${file}`);
            }

            const html = await response.text();

            // Insert HTML
            el.innerHTML = html;

            // Execute scripts inside loaded HTML
            evalScripts(el);

        } catch (error) {
            console.error("Error loading HTML:", error);
        }
    }
}

function evalScripts(container) {
    const scripts = container.querySelectorAll("script");

    scripts.forEach((script) => {
        const newScript = document.createElement("script");

        // Copy attributes
        Array.from(script.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
        });

        // Copy inline code
        if (script.innerHTML) {
            newScript.textContent = script.innerHTML;
        }

        document.body.appendChild(newScript);

        // Cleanup
        document.body.removeChild(newScript);
    });
}