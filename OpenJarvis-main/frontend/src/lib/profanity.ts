const BLOCKED = new Set([
  "ass","asshole","bastard","bitch","bollocks","bullshit","cock","crap",
  "cunt","damn","dick","douchebag","fag","faggot","fuck","fucker","fucking",
  "goddamn","hell","jackass","jerk","motherfucker","nigga","nigger","penis",
  "piss","prick","pussy","retard","shit","slut","twat","vagina","wanker",
  "whore","anus","ballsack","blowjob","boner","boob","butt","buttplug",
  "clitoris","dildo","dyke","erection","fellatio","fisting","handjob",
  "horny","jizz","kike","labia","masturbat","milf","nazi","nipple",
  "orgasm","pedophil","phuck","porn","queef","rape","rapist","rectum",
  "scrotum","semen","sexist","skank","spic","testicle","tit","tranny",
  "vulva","wetback",
]);

export function isProfane(text: string): boolean {
  const lower = text.toLowerCase().replace(/[^a-z]/g, " ");
  const words = lower.split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (BLOCKED.has(w)) return true;
    for (const b of BLOCKED) {
      if (w.includes(b)) return true;
    }
  }
  return false;
}
