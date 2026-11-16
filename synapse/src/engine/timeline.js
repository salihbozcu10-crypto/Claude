// Çekim (shot) zaman çizelgesi. Her çekim, yerel zamanın (lt) saf bir fonksiyonu olarak
// tüm durumu her karede yeniden kurar; böylece kareler herhangi bir sırayla, paralel olarak
// render edilebilir.
//
// Çekim nesnesi:
//   { id: 's1_03', scene: 1, set: 'serverRoom' | 'base' | 'title' | null, dur: saniye,
//     update(ctx, lt, k) }   // lt: çekim içi saniye, k: 0..1 ilerleme
export function createTimeline(shots) {
  let acc = 0;
  const list = shots.map((s) => { const o = { ...s, start: acc }; acc += s.dur; o.end = acc; return o; });
  const duration = acc;
  function at(t) {
    if (t <= 0) return { shot: list[0], lt: 0 };
    for (let i = 0; i < list.length; i++) if (t < list[i].end) return { shot: list[i], lt: t - list[i].start, index: i };
    const last = list[list.length - 1];
    return { shot: last, lt: last.dur - 1e-4, index: list.length - 1 };
  }
  const byId = (id) => list.find((s) => s.id === id);
  return { list, duration, at, byId };
}
