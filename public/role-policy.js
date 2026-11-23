export const isStaff=user=>['ADMIN','OFFICER'].includes(user?.role);
export const homeFor=user=>isStaff(user)?'dashboard':'board';
export function navigationFor(user){
 const links=isStaff(user)?[['dashboard','clipboard','My workspace'],['analytics','chart','City analytics']]:[['board','grid','Community board']];
 if(user?.role==='CITIZEN')links.push(['mine','clipboard','My reports'],['report','plus','Report an issue']);
 if(user?.role==='ADMIN')links.push(['manage','people','Administration']);
 if(user)links.push(['notifications','bell','Notifications']);
 return links;
}
export function routeFor(user,page){return isStaff(user)&&['board','report','mine','register','login'].includes(page)?'dashboard':page;}
