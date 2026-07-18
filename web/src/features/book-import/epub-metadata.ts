const OPF_NAMESPACE = "http://www.idpf.org/2007/opf";

export function readEpubCreators(document: Document): string[] {
  const creators = Array.from(document.getElementsByTagNameNS("*", "creator"))
    .map((element) => ({
      name: (element.textContent ?? "").trim(),
      role:
        element.getAttributeNS(OPF_NAMESPACE, "role") ??
        element.getAttribute("opf:role") ??
        element.getAttribute("role") ??
        ""
    }))
    .filter((creator) => creator.name);
  const authors = creators
    .filter((creator) => creator.role === "aut")
    .map((creator) => creator.name);
  return authors.length ? authors : creators.map((creator) => creator.name);
}
