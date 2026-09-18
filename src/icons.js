const ICON_NS = "http://www.w3.org/2000/svg";

export function createIcon(name, className = "icon") {
  const svg = document.createElementNS(ICON_NS, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(ICON_NS, "use");
  use.setAttribute("href", "#icon-" + name);
  svg.appendChild(use);
  return svg;
}
