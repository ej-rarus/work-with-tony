# Carousel visual systems

Both systems use a fixed 1080×1350 canvas and the same validated content layouts. `template: "editorial-blue"` opts into the approved photographic design. Omitting `template` retains Tony Digital Field Notes without changing legacy output.

## Tony Editorial Blue

- A photo-led editorial cover with a saturated blue field, tactile ivory paper, and white type. Use a deliberate crop and space for the title, not a flattened screenshot of the whole card.
- Titles, body text, brand/series metadata, and footer/page numbers are DOM text. The photograph carries the physical subject; its printed demonstration wording is raster content, not another editable text layer.
- Select images for the actual topic. The bundled paper-reveal Markdown photograph illustrates Markdown; HTML, APIs, and other subjects need their own relevant visual rather than a repeated `.md` prop.
- Alternate the blue cover with light explanatory pages and strong typographic pauses. Keep one teaching point prominent per page and comfortable margins at Instagram size.
- Use `cover` for the photographic opening; `scene` for an explanation; `compare` for source/result; `prompt` for practice; and `close` for a clear next action. `checklist` and `statement` support longer sequences without adding new layout names.
- Keep syntax, prompts, and comparisons as readable text. Do not replace instructional content with illegible decorative code or fake application chrome. Do not add a character by default.
- The personal `artifact-template-tony-editorial-blue` skill can guide image generation; it does not create this editable HTML project.

Candidate JSON supplies text, layout names, and local assets. Edit a built project's `deck.json` and rebuild into a new directory to revise content. For template styling, change the source `assets/carousel.css` in the plugin and rebuild; hand-editing generated CSS, HTML, JavaScript, copied images, or report hashes breaks the trusted export workflow.

## Tony Digital Field Notes (legacy)

The carousel uses a Component Playground rhythm: every slide should make one real object, syntax fragment, comparison, or action visually dominant while the sequence still moves from question to explanation, evidence, practice, and close.

- Cool near-white paper, blue-black ink, and one restrained cobalt-blue accent.
- Heavy contemporary Korean sans for display and body; mono only for file names, syntax, prompts, and page counts.
- Treat subject-specific objects such as `.md`, `#`, `README.md`, a real screenshot, or a source/result pair as the image. Do not add decorative rectangles when the content can carry the frame.
- Asymmetrical, slide-specific composition. A comparison can use unequal columns; a checklist can work as an index; a prompt should appear as plain copyable text. Do not repeat one masthead, footer rule, or rounded card template.
- No gradients, glass panels, decorative stock photography, fake browser or code-window chrome, generic feature icons, coloured glow, or invented proof.
- The cover leads with typography and does not automatically include the Tony character.
- Images must explain or anchor a scene. If there is no useful image, use the topic's own file, symbol, or interface language instead.
- Still export has no decorative motion. The preview exists to inspect the slides, not to simulate a social feed.

The bundled renderer owns colours, typography, spacing, DOM construction, and output size. Candidate JSON chooses only content, fixed layout names, and validated local assets.
