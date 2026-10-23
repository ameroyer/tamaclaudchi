// The sprites: the pet's body, eyes, egg, hats and held items, as pixel cells.

export type Cell = [number, number, string?]
export type Skin = { body: string; outline: string }

export const MODEL_SKIN: Record<string, {label: string, body: string, outline: string}> = {
  fable:  {label: "Fable",  body: "#ff6188", outline: "#b23557"},
  opus:   {label: "Opus",   body: "#ab9df2", outline: "#7568b8"},
  sonnet: {label: "Sonnet", body: "#78dce8", outline: "#4899a5"},
  haiku:  {label: "Haiku",  body: "#a9dc76", outline: "#6f9c48"},
  other:  {label: "egg", body: "#d08b6c", outline: "#9a5c40"},
};

export const REPO_SKINS: Skin[] = [
  {body: "#f794ad", outline: "#ad4e66"}, {body: "#f7a194", outline: "#ad5a4e"},
  {body: "#f7c694", outline: "#ad7e4e"}, {body: "#f7eb94", outline: "#ada14e"},
  {body: "#dff794", outline: "#96ad4e"}, {body: "#baf794", outline: "#72ad4e"},
  {body: "#94f794", outline: "#4ead4e"}, {body: "#94f7ba", outline: "#4ead72"},
  {body: "#94f7df", outline: "#4ead96"}, {body: "#94ebf7", outline: "#4ea1ad"},
  {body: "#94c6f7", outline: "#4e7ead"}, {body: "#94a1f7", outline: "#4e5aad"},
  {body: "#ad94f7", outline: "#664ead"}, {body: "#d294f7", outline: "#8a4ead"},
  {body: "#f794f7", outline: "#ad4ead"}, {body: "#f794d2", outline: "#ad4e8a"},
];

export const ITEM_NAMES: string[] = ["sword", "shield", "fairywand", "elfstaff", "spellbook", "lantern",
                    "potion", "crystal", "mushroom", "acorn", "apple", "petleash",
                    "leek", "teacup", "sunflower", "balloon", "lollipop", "umbrella",
                    "scroll", "quill"];

export const MODEL_HAT: Record<string, string | null> = {fable: "wizard", opus: "crown", sonnet: "poet", haiku: "kitsune",
                   other: null};

export const CREATURE: Cell[] = (() => {
  const c: Cell[] = [];
  for (let y = 4; y <= 11; y++) for (let x = 3; x <= 14; x++) {
    const corner = (x === 3 || x === 14) && (y === 4 || y === 11);
    if (!corner) c.push([x, y, "T"]);
  }
  // arm nubs, a bit below the middle
  ([[1,7],[2,7],[1,8],[2,8],[15,7],[16,7],[15,8],[16,8]] as [number, number][]).forEach(([x, y]) => c.push([x, y, "T"]));
  [4, 7, 10, 13].forEach(x => { c.push([x, 12, "t"]); c.push([x, 13, "t"]); });
  return c;
})();

export const CLR: Record<string, string | null> = {A: null, G: "#ffd866", S: "#c7ced6", W: "#fdf6ee", D: "#9a6b3f",
             E: "#2d2a2e", P: "#5b53c9", R: "#e0453f", K: "#2a2730",
             N: "#7fbf4d", C: "#5fc9e0", I: "#4f5a6b", B: "#8c5a3c",
             g: "#ffe6a3", r: "#ffb3c1", p: "#cfc4f2", c: "#a9e2f0",
             n: "#bce5a4", s: "#e2e8ee", d: "#cda684"};

export const EYES: Cell[] = [[6,6,"E"],[6,7,"E"],[11,6,"E"],[11,7,"E"]];

export const EGG: Cell[] = (() => {
  const rows = {2:[8,9], 3:[7,10], 4:[6,11], 5:[6,11], 6:[5,12], 7:[5,12],
                8:[5,12], 9:[5,12], 10:[6,11], 11:[7,10]};
  const c: Cell[] = [];
  for (const [y, [x0, x1]] of Object.entries(rows) as [string, [number, number]][])
    for (let x = x0; x <= x1; x++) c.push([x, +y]);
  return c;
})();

export const EGG_SPECKLES: Cell[] = [[8,3,"W"],[6,8,"W"],[11,5,"W"],[9,10,"W"]];

export const HAT: Record<string, Cell[]> = {
  // Fable — tall pointed wizard cone, gold star on the tip, stars on the cloth
  wizard:  [[8,0,"G"],
            [8,1,"P"],[9,1,"P"],
            [7,2,"P"],[8,2,"G"],[9,2,"P"],[10,2,"P"],
            [6,3,"P"],[7,3,"P"],[8,3,"P"],[9,3,"G"],[10,3,"P"],[11,3,"P"],
            [4,4,"P"],[5,4,"G"],[6,4,"P"],[7,4,"P"],[8,4,"P"],[9,4,"P"],
            [10,4,"P"],[11,4,"G"],[12,4,"P"],[13,4,"P"]],
  // Opus — a diadem rather than a helm: the knight's visor was the least cute
  // thing on the shelf. Gold band, three points, a jewel in each.
  crown:   [[4,3,"G"],[5,3,"G"],[6,3,"G"],[7,3,"G"],[8,3,"G"],[9,3,"G"],
            [10,3,"G"],[11,3,"G"],[12,3,"G"],[13,3,"G"],             // band
            [5,2,"G"],[8,2,"G"],[9,2,"G"],[12,2,"G"],                // points
            [5,1,"C"],[8,1,"R"],[9,1,"R"],[12,1,"C"],                // jewels
            [6,3,"P"],[11,3,"P"]],                                   // inset gems
  // Sonnet — wide-brimmed poet's hat, black, with a white quill
  poet:    [[7,1,"K"],[8,1,"K"],[9,1,"K"],[10,1,"K"],
            [6,2,"K"],[7,2,"K"],[8,2,"K"],[9,2,"K"],[10,2,"K"],[11,2,"K"],
            [3,3,"K"],[4,3,"K"],[5,3,"K"],[6,3,"K"],[7,3,"K"],[8,3,"K"],
            [9,3,"K"],[10,3,"K"],[11,3,"K"],[12,3,"K"],[13,3,"K"],[14,3,"K"],
            [13,0,"W"],[12,1,"W"],[13,1,"W"],[12,2,"W"]],          // quill
  // Haiku — fox mask pushed to the side of the head, not over the eyes
  kitsune: [[2,1,"K"],[5,1,"K"],                                   // ear tips
            [2,2,"W"],[5,2,"W"],
            [1,3,"K"],[2,3,"W"],[3,3,"W"],[4,3,"W"],[5,3,"W"],[6,3,"K"],
            [1,4,"K"],[2,4,"W"],[3,4,"R"],[4,4,"R"],[5,4,"W"],[6,4,"K"],
            [1,5,"K"],[2,5,"W"],[3,5,"W"],[4,5,"W"],[5,5,"W"],[6,5,"K"],
            [2,6,"K"],[3,6,"W"],[4,6,"R"],[5,6,"K"]],               // rimmed snout
};

export const ITEM: Record<string, Cell[]> = {
  sword:     [[16,0,"W"],[17,0,"s"],                                   // tip
              [16,1,"W"],[17,1,"s"],
              [16,2,"W"],[17,2,"s"],
              [16,3,"W"],[17,3,"s"],
              [15,4,"g"],[16,4,"g"],[17,4,"g"],[18,4,"g"],             // crossguard
              [16,5,"d"],[17,5,"d"],[16,6,"d"],[17,6,"d"],             // grip
              [16,7,"g"],[17,7,"g"]],                                  // pommel
  shield:    [[15,3,"s"],[16,3,"s"],[17,3,"s"],[18,3,"s"],
              [15,4,"s"],[16,4,"c"],[17,4,"c"],[18,4,"s"],
              [15,5,"s"],[16,5,"W"],[17,5,"c"],[18,5,"s"],
              [15,6,"s"],[16,6,"c"],[17,6,"c"],[18,6,"s"],
              [16,7,"s"],[17,7,"s"],
              [16,8,"s"]],
  // A four-point star on a slim wand. It used to be a solid gold lump on a
  // same-width stick, which read as a stick of dynamite.
  fairywand: [[16,0,"g"],
              [15,1,"g"],[16,1,"W"],[17,1,"g"],
              [16,2,"g"],
              [16,3,"p"],[16,4,"p"],[16,5,"p"],[16,6,"p"],[16,7,"p"],[16,8,"p"]],
  elfstaff:  [[16,0,"n"],[15,1,"n"],[17,1,"n"],                        // leaves
              [16,1,"c"],[16,2,"W"],                                   // gem
              [16,3,"d"],[16,4,"d"],[15,5,"n"],[16,5,"d"],
              [16,6,"d"],[16,7,"d"],[16,8,"d"]],
  spellbook: [[15,3,"p"],[16,3,"p"],[17,3,"p"],[18,3,"p"],
              [15,4,"p"],[16,4,"g"],[17,4,"g"],[18,4,"p"],             // clasp
              [15,5,"p"],[16,5,"p"],[17,5,"p"],[18,5,"p"],
              [15,6,"W"],[16,6,"W"],[17,6,"W"],[18,6,"W"],             // page block
              [15,7,"W"],[16,7,"W"],[17,7,"W"],[18,7,"W"]],
  lantern:   [[16,2,"d"],[15,3,"d"],[17,3,"d"],                        // hoop
              [15,4,"s"],[16,4,"s"],[17,4,"s"],
              [15,5,"g"],[16,5,"W"],[17,5,"g"],
              [15,6,"g"],[16,6,"g"],[17,6,"g"],
              [15,7,"s"],[16,7,"s"],[17,7,"s"]],
  potion:    [[16,2,"d"],[16,3,"W"],                                   // cork, neck
              [15,4,"W"],[16,4,"W"],[17,4,"W"],
              [15,5,"r"],[16,5,"W"],[17,5,"r"],
              [15,6,"r"],[16,6,"r"],[17,6,"r"],
              [16,7,"r"]],
  crystal:   [[16,2,"c"],
              [15,3,"c"],[16,3,"W"],[17,3,"c"],
              [15,4,"c"],[16,4,"c"],[17,4,"c"],
              [15,5,"c"],[16,5,"c"],[17,5,"c"],
              [16,6,"c"]],
  mushroom:  [[15,3,"r"],[16,3,"r"],[17,3,"r"],
              [15,4,"r"],[16,4,"W"],[17,4,"r"],
              [15,5,"W"],[16,5,"W"],[17,5,"W"],                        // gills
              [16,6,"W"],[16,7,"W"],[16,8,"W"]],
  acorn:     [[16,2,"n"],                                              // stalk
              [15,3,"d"],[16,3,"d"],[17,3,"d"],                        // cap
              [15,4,"g"],[16,4,"g"],[17,4,"g"],
              [15,5,"g"],[16,5,"W"],[17,5,"g"],
              [16,6,"g"]],
  apple:     [[16,2,"d"],[17,2,"n"],
              [15,3,"r"],[16,3,"r"],[17,3,"r"],
              [15,4,"r"],[16,4,"W"],[17,4,"r"],
              [15,5,"r"],[16,5,"r"],[17,5,"r"],
              [16,6,"r"]],
  // A lead running down from the hand to a small round companion.
  petleash:  [[15,4,"d"],[15,5,"d"],[16,6,"d"],                        // lead
              [16,7,"g"],[18,7,"g"],                                   // ears
              [16,8,"g"],[17,8,"g"],[18,8,"g"],
              [16,9,"E"],[17,9,"g"],[18,9,"E"],                        // eyes
              [16,10,"g"],[17,10,"g"],[18,10,"g"]],
  leek:      [[15,0,"n"],[17,0,"n"],[15,1,"n"],[16,1,"n"],[17,1,"n"],
              [16,2,"n"],[16,3,"n"],
              [16,4,"W"],[16,5,"W"],[16,6,"W"],[16,7,"W"],[16,8,"W"]],
  teacup:    [[17,1,"W"],[16,2,"W"],                                   // steam
              [15,4,"W"],[16,4,"W"],[17,4,"W"],
              [15,5,"W"],[16,5,"c"],[17,5,"W"],[18,5,"W"],             // handle
              [15,6,"W"],[16,6,"W"],[17,6,"W"],
              [15,7,"s"],[16,7,"s"],[17,7,"s"],[18,7,"s"]],            // saucer
  sunflower: [[15,2,"g"],[16,2,"g"],[17,2,"g"],
              [15,3,"g"],[16,3,"d"],[17,3,"g"],
              [15,4,"g"],[16,4,"g"],[17,4,"g"],
              [16,5,"n"],[16,6,"n"],[17,6,"n"],[16,7,"n"],[16,8,"n"]],
  balloon:   [[16,0,"r"],
              [15,1,"r"],[16,1,"W"],[17,1,"r"],
              [15,2,"r"],[16,2,"r"],[17,2,"r"],
              [16,3,"r"],
              [16,4,"W"],[16,5,"W"],[16,6,"W"],[16,7,"W"]],
  lollipop:  [[16,1,"r"],
              [15,2,"r"],[16,2,"W"],[17,2,"r"],
              [15,3,"W"],[16,3,"r"],[17,3,"r"],                        // swirl
              [16,4,"r"],
              [16,5,"W"],[16,6,"W"],[16,7,"W"],[16,8,"W"]],
  umbrella:  [[16,0,"r"],
              [15,1,"r"],[16,1,"W"],[17,1,"r"],
              [15,2,"r"],[16,2,"r"],[17,2,"r"],
              [15,3,"W"],[16,3,"r"],[17,3,"W"],                        // scallops
              [16,4,"d"],[16,5,"d"],[16,6,"d"],[16,7,"d"],[16,8,"d"],[17,8,"d"]],
  scroll:    [[15,3,"d"],[16,3,"d"],[17,3,"d"],[18,3,"d"],             // top rod
              [15,4,"W"],[16,4,"W"],[17,4,"W"],[18,4,"W"],
              [15,5,"W"],[16,5,"d"],[17,5,"d"],[18,5,"W"],             // writing
              [15,6,"W"],[16,6,"W"],[17,6,"W"],[18,6,"W"],
              [15,7,"d"],[16,7,"d"],[17,7,"d"],[18,7,"d"]],            // bottom rod
  quill:     [[18,0,"W"],[17,1,"W"],[18,1,"W"],
              [17,2,"W"],[18,2,"W"],[16,3,"W"],[17,3,"W"],
              [16,4,"W"],[17,4,"W"],
              [16,5,"g"],                                              // nib
              [16,6,"d"],[16,7,"d"],[16,8,"d"]],
};
