// Whether a test match is on the screen inside an arena's Try it tab, so the room can say in one
// sentence that the real round closed it (spec 75, section 6). The tab unmounts when the round
// starts, before the room's own effect runs, so the flag is cleared one task later and the room
// still reads it.
// ponytail: a module flag and a zero-delay clear; a prop from the room through the preparation
// pane would replace it if the pane ever stays mounted during a round.

let shown = false;

export function testMatchShown(): boolean {
  return shown;
}

export function markTestMatchShown(): () => void {
  shown = true;
  return () => {
    setTimeout(() => {
      shown = false;
    }, 0);
  };
}
