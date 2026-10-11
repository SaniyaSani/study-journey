// Pixel-art sprites, tiled background and the emoji -> pixel-sticker converter (moved unchanged from the single-file app).
export const SPAL={o:'#5B2A3E',f:'#FFF9FB',p:'#FFD3E2',e:'#FF9DBB',n:'#E8527F',b:'#FFB3CB',w:'#FFFFFF',r:'#E8527F',q:'#C93B66'};
export const SK=["...o................o...", "..ofo..............ofo..", "..ofeo............oefo..", "..ofefo.........oofefo..", "..ofeefooooooooorrerro..", "..offfffffffffffrrqrro..", ".offffffffffffffrrfrrfo.", ".offffffffffffffffffffo.", "offffffffffffffffffffffo", "offffffffffffffffffffffo", "offfffooffffffffoofffffo", "offfffooffffffffoofffffo", "offfffooffffffffoofffffo", "opfbbffffffnnffffffbbfpo", "opffffffffoffoffffffffpo", "opfffffffffoofffffffffpo", "opffffffffffffffffffffpo", ".ooppppppppppppppppppoo.", "...oooooooooooooooooo..."],SH=["..oo.oo..", ".orrorro.", "orwrrrrro", "orrrrrrro", ".orrrrro.", "..orrro..", "...oro...", "....o...."],SS=["...f...", "..fff..", ".fffff.", "fffffff", ".fffff.", "..fff..", "...f..."];
export function rects(rows,pal,ox=0,oy=0){let r='';rows.forEach((row,y)=>{let x=0;while(x<row.length){const ch=row[x];if(ch==='.'){x++;continue}let x2=x;while(x2<row.length&&row[x2]===ch)x2++;r+=`<rect x="${x+ox}" y="${y+oy}" width="${x2-x}" height="1" fill="${pal[ch]}"/>`;x=x2}});return r}
export function sprite(rows,pal,s){return`<svg xmlns="http://www.w3.org/2000/svg" width="${rows[0].length*s}" height="${rows.length*s}" viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rects(rows,pal)}</svg>`}
export const KIT=sprite(SK,SPAL,5);
const dataUrl=svg=>`url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
(function(){const R=document.documentElement.style;
 R.setProperty('--tile',dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" shape-rendering="crispEdges">${rects(SS,{f:'#FFFFFF'},4,5)}${rects(SS,{f:'#FFFFFF'},30,26)}${rects(['.rr.rr.','rrrrrrr','.rrrrr.','..rrr..','...r...'],{r:'#FFB6CE'},34,6)}${rects(['.rr.rr.','rrrrrrr','.rrrrr.','..rrr..','...r...'],{r:'#FFB6CE'},10,32)}</svg>`));
 R.setProperty('--divider',dataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="8" viewBox="0 0 26 8" shape-rendering="crispEdges">${rects(SH,SPAL,0,0)}${rects(SS,{f:'#F28DB0'},16,0)}</svg>`))})();
/* every emoji becomes a chunky pixel sticker: drawn at 16x16, snapped to a small palette, outlined, shown at 2x with nearest-neighbour scaling */
const PXC=new Map(),EMO_T=/\p{Extended_Pictographic}/u,EMO_G=/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*️?/gu;
function pxEmoji(e){if(PXC.has(e))return PXC.get(e);let url='';try{const N=16,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d',{willReadFrequently:true});
 x.font='13px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText(e,N/2,N/2+1);
 const d=x.getImageData(0,0,N,N),p=d.data,on=new Uint8Array(N*N);
 for(let i=0;i<N*N;i++){if(p[i*4+3]>=100){on[i]=1;p[i*4+3]=255;for(let k=0;k<3;k++)p[i*4+k]=Math.min(255,Math.round(p[i*4+k]/64)*64)}else p[i*4+3]=0}
 for(let y=0;y<N;y++)for(let X=0;X<N;X++){const i=y*N+X;if(on[i])continue;if((X>0&&on[i-1])||(X<N-1&&on[i+1])||(y>0&&on[i-N])||(y<N-1&&on[i+N])){p[i*4]=91;p[i*4+1]=42;p[i*4+2]=62;p[i*4+3]=255}}
 x.putImageData(d,0,0);url=c.toDataURL()}catch(err){}
 PXC.set(e,url);return url}
function emojiNodes(root){const out=[];if(root.nodeType===3)out.push(root);else if(root.nodeType===1){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())out.push(n)}
 return out.filter(n=>n.parentElement&&!n.parentElement.closest('pre,textarea,script,style,title')&&EMO_T.test(n.data))}
function swapEmoji(n){const t=n.data,f=document.createDocumentFragment();let last=0;
 t.replace(EMO_G,(m,off)=>{if(off>last)f.append(t.slice(last,off));const u=pxEmoji(m);if(u){const im=new Image();im.className='pxe';im.alt=m;im.src=u;im.draggable=false;f.append(im)}else f.append(m);last=off+m.length;return m});
 if(last<t.length)f.append(t.slice(last));n.replaceWith(f)}
export function pixelate(root){emojiNodes(root).forEach(swapEmoji)}
export function watchEmoji(){const mo=new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData')emojiNodes(m.target).forEach(swapEmoji);else m.addedNodes.forEach(n=>emojiNodes(n).forEach(swapEmoji))}});
 ['app','side','rail','bnav','playerbar','selbar','toast','sheet'].forEach(id=>{const el=document.getElementById(id);if(el)mo.observe(el,{childList:true,subtree:true,characterData:true})})}

