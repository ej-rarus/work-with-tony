(() => {
  "use strict";

  const dataNode = document.getElementById("carousel-data");
  const root = document.getElementById("carousel");
  const qa = document.getElementById("carousel-qa");
  const deck = JSON.parse(dataNode.textContent);
  const editorial = deck.template === "editorial-blue";
  const assets = new Map(deck.assets.map((asset) => [asset.id, asset]));
  let missingAsset = false;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const addText = (parent, tag, className, text) => {
    if (text === undefined) return null;
    const node = element(tag, className, text);
    node.dataset.qaBound = "true";
    parent.append(node);
    return node;
  };

  const createAsset = (assetId, className = "asset-figure") => {
    const asset = assets.get(assetId);
    if (!asset) {
      missingAsset = true;
      return null;
    }
    const figure = element("figure", className);
    const image = element("img");
    image.src = asset.file;
    image.alt = asset.alt;
    image.width = 800;
    image.height = 800;
    image.classList.add(`asset--${asset.fit}`, `asset--${asset.position}`);
    image.addEventListener("error", () => { missingAsset = true; }, { once: true });
    figure.append(image);
    return figure;
  };

  const renderers = {};

  renderers.cover = (content, slide) => {
    addText(content, "h1", "slide__title", slide.title);
    addText(content, "p", "slide__body", slide.body);
  };

  renderers.scene = (content, slide) => {
    const copy = element("div", "scene__copy");
    addText(copy, "h2", "slide__title", slide.title);
    addText(copy, "p", "slide__body", slide.body);
    addText(copy, "p", "slide__note", slide.note);
    content.append(copy);
    const visual = slide.assetId ? createAsset(slide.assetId) : null;
    if (visual) {
      content.append(visual);
      return;
    }
    if (editorial) return;
    const specimen = element("div", "scene__specimen");
    specimen.setAttribute("aria-hidden", "true");
    specimen.append(element("span", "scene__extension", ".md"));
    specimen.append(element("span", "scene__caption", "plain text\nportable\nreadable"));
    content.append(specimen);
  };

  renderers.compare = (content, slide) => {
    const intro = element("div", "compare__intro");
    addText(intro, "h2", "slide__title", slide.title);
    addText(intro, "p", "slide__body", slide.body);
    content.append(intro);
    const grid = element("div", "compare__grid");
    for (const [kind, label, value] of [["before", "쓰는 모습", slide.before], ["after", "보이는 모습", slide.after]]) {
      const panel = element("section", `compare__panel compare__panel--${kind}`);
      panel.append(element("span", "compare__label", label));
      addText(panel, "p", "compare__value", value);
      grid.append(panel);
    }
    content.append(grid);
  };

  renderers.checklist = (content, slide) => {
    addText(content, "h2", "slide__title", slide.title);
    addText(content, "p", "slide__body", slide.body);
    const list = element("ol", "checklist");
    slide.items.forEach((item) => {
      const row = element("li", "checklist__item");
      row.append(element("span", "checklist__index", "—"));
      addText(row, "span", "checklist__text", item);
      list.append(row);
    });
    content.append(list);
  };

  renderers.prompt = (content, slide) => {
    addText(content, "h2", "slide__title", slide.title);
    addText(content, "p", "slide__body", slide.body);
    const frame = element("div", "prompt__frame");
    const prompt = element("p", "prompt__text");
    prompt.dataset.qaBound = "true";
    prompt.append(element("span", "prompt__cursor"), document.createTextNode(slide.prompt));
    frame.append(prompt);
    content.append(frame);
  };

  renderers.statement = (content, slide) => {
    content.append(element("div", "statement__rule"));
    addText(content, "h2", "slide__title", slide.title);
    addText(content, "p", "slide__body", slide.body);
    addText(content, "p", "slide__note", slide.note);
  };

  renderers.close = (content, slide) => {
    const copy = element("div", "close__copy");
    addText(copy, "h2", "slide__title", slide.title);
    addText(copy, "p", "slide__body", slide.body);
    addText(copy, "p", "slide__next", slide.next);
    content.append(copy);
    if (editorial) return;
    const visual = slide.assetId ? createAsset(slide.assetId, "close__mark close__mark--asset") : null;
    content.append(visual || element("div", "close__mark", `${deck.meta.handle}\nSAVE · TRY · SHARE`));
  };

  const createSlide = (slide) => {
    const article = element("article", `slide slide--${slide.layout}${editorial ? " template--editorial-blue" : ""}${editorial && slide.assetId ? " slide--has-asset" : ""}`);
    article.dataset.slideId = slide.id;
    article.setAttribute("aria-label", slide.altText);
    const masthead = element("header", "slide__masthead");
    addText(masthead, "span", "slide__brand", deck.meta.brand);
    addText(masthead, "span", "slide__series", editorial ? deck.meta.series : `${deck.meta.series} · ${deck.meta.issue}`);
    const content = element("div", "slide__content");
    content.dataset.qaBound = "true";
    renderers[slide.layout](content, slide);
    const footer = element("footer", "slide__footer");
    footer.append(element("span", "slide__handle", deck.meta.handle));
    footer.append(element("span", "slide__page", `${slide.id} / ${String(deck.slides.length).padStart(2, "0")}`));
    if (editorial && slide.assetId && ["cover", "close"].includes(slide.layout)) {
      const photo = createAsset(slide.assetId, "cover__photo");
      if (photo) article.append(photo);
    }
    article.append(masthead, content, footer);
    return article;
  };

  const params = new URLSearchParams(window.location.search);
  if (editorial) document.body.classList.add("preview--editorial-blue");
  const requestedId = params.get("slide");
  if (params.get("export") === "1") document.body.classList.add("is-export");
  const selected = requestedId ? deck.slides.filter((slide) => slide.id === requestedId) : deck.slides;
  if (requestedId && selected.length !== 1) missingAsset = true;
  selected.forEach((slide) => root.append(createSlide(slide)));

  const waitForImageLoad = (image) => new Promise((resolve) => {
    const finish = () => {
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
    // decode() can remain pending under Chrome's virtual clock after load.
    // Cached successes and failures are both complete; dimensions distinguish them.
    if (image.complete) finish();
  });

  const finishQa = async () => {
    const images = [...document.images];
    await Promise.all(images.map(async (image) => {
      await waitForImageLoad(image);
      if (!image.naturalWidth || !image.naturalHeight) missingAsset = true;
    }));
    if (document.fonts && document.fonts.ready) {
      await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
    const overflowing = [...document.querySelectorAll("[data-qa-bound]")].filter((node) => node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 12);
    const overflow = overflowing.length > 0;
    const overflowDetail = overflowing.map((node) => `${node.className || node.tagName}:${node.scrollWidth}x${node.scrollHeight}>${node.clientWidth}x${node.clientHeight}`).join(",");
    qa.dataset.ready = "true";
    qa.dataset.overflow = String(overflow);
    qa.dataset.missing = String(missingAsset);
    qa.dataset.overflowDetail = overflowDetail;
    qa.dataset.slide = requestedId || "all";
    qa.textContent = JSON.stringify({ ready: true, overflow, overflowDetail, missing: missingAsset, slide: requestedId || "all" });
  };

  finishQa().catch(() => {
    qa.dataset.ready = "true";
    qa.dataset.overflow = "true";
    qa.dataset.missing = "true";
    qa.textContent = JSON.stringify({ ready: true, overflow: true, missing: true, slide: requestedId || "all" });
  });
})();
