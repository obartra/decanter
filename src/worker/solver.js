/* Water-sort solver. Shipped verbatim inside the page as a Web Worker.
   Uses A* with a consistent, admissible heuristic:
     h = (total contiguous color segments) - (number of colors)
   A pour moves one maximal top run, so it merges at most one segment per move.
   Therefore each move lowers the segment count by at most 1, and the goal has
   exactly one segment per color. A* with a consistent heuristic and a closed
   set returns a true minimum. */
var CAP = 4;

function cl(t){ var o=[],i; for(i=0;i<t.length;i++) o.push(t[i].slice()); return o; }
function keyOf(t){ var a=[],i; for(i=0;i<t.length;i++) a.push(t[i].join(',')); a.sort(); return a.join('|'); }
function full(t){ if(t.length!==CAP) return false; for(var i=1;i<t.length;i++) if(t[i]!==t[0]) return false; return true; }
function done(s){ for(var i=0;i<s.length;i++) if(s[i].length && !full(s[i])) return false; return true; }
function segs(s){ var n=0,i,j; for(i=0;i<s.length;i++) for(j=0;j<s[i].length;j++) if(j===0||s[i][j]!==s[i][j-1]) n++; return n; }

/* every move the game itself allows, with no pruning */
/* Unpruned, and only ever called by the test that proves the pruning below
   removes nothing the search needs. Kept here rather than duplicated in the test
   so the two can never drift. */
/* eslint-disable-next-line no-unused-vars */
function rawMoves(s){
  var out=[],a,b,A,B,top,run,i;
  for(a=0;a<s.length;a++){
    A=s[a]; if(!A.length) continue;
    if(full(A)) continue;
    top=A[A.length-1]; run=1;
    for(i=A.length-2;i>=0&&A[i]===top;i--) run++;
    for(b=0;b<s.length;b++){
      if(a===b) continue;
      B=s[b];
      if(B.length>=CAP) continue;
      if(B.length && B[B.length-1]!==top) continue;
      out.push([a,b,Math.min(run, CAP-B.length)]);
    }
  }
  return out;
}

/* same set, minus moves that cannot change the canonical state:
   - a uniform tube emptied into an empty tube (identical multiset of tubes)
   - duplicate destinations (empty tubes are interchangeable, as are equal tubes) */
function moveList(s){
  var out=[],a,b,A,B,top,run,i,whole,emptySeen,dstSeen,k;
  for(a=0;a<s.length;a++){
    A=s[a]; if(!A.length) continue;
    if(full(A)) continue;
    top=A[A.length-1]; run=1;
    for(i=A.length-2;i>=0&&A[i]===top;i--) run++;
    whole=(run===A.length);
    emptySeen=false; dstSeen={};
    for(b=0;b<s.length;b++){
      if(a===b) continue;
      B=s[b];
      if(B.length>=CAP) continue;
      if(!B.length){
        if(whole) continue;
        if(emptySeen) continue;
        emptySeen=true;
      } else {
        if(B[B.length-1]!==top) continue;
        k=B.join(','); if(dstSeen[k]) continue; dstSeen[k]=1;
      }
      out.push([a,b,Math.min(run, CAP-B.length)]);
    }
  }
  return out;
}
function doMove(s,m){ var i; for(i=0;i<m[2];i++) s[m[1]].push(s[m[0]].pop()); }

function astar(start, colors, nodeCap, msCap){
  var t0 = Date.now();
  var buckets=[], gmap=Object.create(null), remaining=0, f=0, expanded=0;
  /* Each node carries the move that left the start, so the search can say what
     to play next and not only how many pours are left. Nothing else is kept: a
     hint needs one move, and parent pointers for a whole path would hold every
     expanded board in memory for the sake of a step nobody asked for. */
  function push(fv,st,g,m0){
    if(!buckets[fv]) buckets[fv]=[];
    buckets[fv].push({s:st,g:g,m0:m0});
    remaining++;
  }
  gmap[keyOf(start)]=0;
  push(segs(start)-colors, cl(start), 0, null);
  while(remaining>0){
    while(f<buckets.length && (!buckets[f] || !buckets[f].length)) f++;
    if(f>=buckets.length) break;
    var node=buckets[f].pop(); remaining--;
    var k=keyOf(node.s);
    if(gmap[k]!==undefined && gmap[k]<node.g) continue;
    if(done(node.s)) return {par:node.g, exact:true, expanded:expanded, first:node.m0};
    if(++expanded>nodeCap) return {par:null, exact:false, expanded:expanded};
    if((expanded & 1023)===0 && msCap && Date.now()-t0>msCap) return {par:null, exact:false, expanded:expanded};
    var ms=moveList(node.s), i;
    for(i=0;i<ms.length;i++){
      var nx=cl(node.s); doMove(nx,ms[i]);
      var nk=keyOf(nx), ng=node.g+1;
      if(gmap[nk]!==undefined && gmap[nk]<=ng) continue;
      gmap[nk]=ng;
      push(ng + segs(nx) - colors, nx, ng, node.m0 || ms[i]);
    }
  }
  return {par:null, exact:false, expanded:expanded};
}

/* upper bound when the exact search runs out of budget */
function anySolution(start){
  var stack=[{s:cl(start),d:0}], seen=Object.create(null), n=0;
  while(stack.length){
    if(n++>150000) return null;
    var cur=stack.pop(), k=keyOf(cur.s);
    if(seen[k]) continue; seen[k]=1;
    if(done(cur.s)) return cur.d;
    var ms=moveList(cur.s), i;
    for(i=0;i<ms.length;i++){ var nx=cl(cur.s); doMove(nx,ms[i]); stack.push({s:nx,d:cur.d+1}); }
  }
  return null;
}

self.onmessage = function(e){
  var d=e.data;
  CAP = d.cap;
  var r = astar(d.tubes, d.colors, d.nodeCap||400000, d.msCap||7000);
  if(r.par===null){ r = {par:anySolution(d.tubes), exact:false}; }
  self.postMessage({id:d.id, par:r.par, exact:r.exact, first:r.first || null});
};
