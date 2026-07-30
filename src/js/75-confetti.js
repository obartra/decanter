/* Paper bits. Two flavours: a small burst when one bottle is corked, and a
   full screen fall when a level is finished. */
const Confetti = (() => {
  let layer = null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ensure = () => (layer = layer || document.getElementById('confetti'));
  return {
    burst(cx, cy, count, palette, power){
      if (reduce || !ensure()) return;
      for (let i = 0; i < count; i++){
        const p = document.createElement('div');
        p.className = 'conf';
        const thin = Math.random() < 0.4;
        p.style.width = (thin ? 3 : 6) + 'px';
        p.style.height = (thin ? 9 : 6) + 'px';
        p.style.background = palette[i % palette.length];
        p.style.left = cx + 'px'; p.style.top = cy + 'px';
        const a = -Math.PI/2 + (Math.random() - 0.5) * 1.9;
        const v = power * (0.55 + Math.random() * 0.65);
        const ux = Math.cos(a) * v, uy = Math.sin(a) * v;
        p.animate([
          { transform:'translate(0,0) rotate(0deg)', opacity:1 },
          { transform:`translate(${ux*0.6}px,${uy}px) rotate(${(Math.random()*540-270)|0}deg)`, opacity:1, offset:0.42 },
          { transform:`translate(${ux}px,${uy+90+Math.random()*70}px) rotate(${(Math.random()*900-450)|0}deg)`, opacity:0 }
        ], { duration: 900 + Math.random()*600, easing:'cubic-bezier(.15,.6,.4,1)' })
         .onfinish = () => p.remove();
        layer.appendChild(p);
      }
    },
    rain(palette){
      if (reduce || !ensure()) return;
      const cols = palette.concat(['#F7DEB4', '#D8A76D', '#FFFFFF']);
      for (let i = 0; i < 90; i++){
        const p = document.createElement('div');
        p.className = 'conf';
        const thin = Math.random() < 0.45;
        p.style.width = (thin ? 3 : 7) + 'px';
        p.style.height = (thin ? 11 : 7) + 'px';
        p.style.background = cols[(Math.random() * cols.length) | 0];
        p.style.left = (Math.random() * innerWidth) + 'px';
        p.style.top = '-20px';
        const sway = (Math.random() - 0.5) * 180;
        p.animate([
          { transform:'translate(0,0) rotate(0deg)', opacity:1 },
          { transform:`translate(${sway*0.5}px,${innerHeight*0.5}px) rotate(${(Math.random()*720-360)|0}deg)`, offset:0.5 },
          { transform:`translate(${sway}px,${innerHeight+40}px) rotate(${(Math.random()*1200-600)|0}deg)`, opacity:0.9 }
        ], { duration: 2000 + Math.random()*1600, delay: Math.random()*700, easing:'cubic-bezier(.25,.5,.5,1)' })
         .onfinish = () => p.remove();
        layer.appendChild(p);
      }
    }
  };
})();
globalThis.Confetti = Confetti;
