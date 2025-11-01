export function isValidEmail(email){
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!re.test(email)) return false;
  const disposable = [
    "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com","dispostable.com",
    "trashmail.com","maildrop.cc","yopmail.com"
  ];
  const domain = String(email).split("@")[1]?.toLowerCase() || "";
  return !disposable.includes(domain);
}

export function subscribeAuth(cb){
  // simple local listener using storage events
  const key = "fns:email";
  function emit(){ const v = localStorage.getItem(key); cb(v ? { email: v } : null); }
  emit();
  function onStorage(e){ if(e.key === key) emit(); }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export async function loginWithEmail(email){
  if(!isValidEmail(email)) return null;
  localStorage.setItem("fns:email", email);
  return { email };
}

export async function logout(){
  localStorage.removeItem("fns:email");
}