import {db} from '../src/db.js';
import {hashPassword} from '../src/services/security.js';
const demoPassword='CityDemo!2026';
try {
 if(await db.user.count()>0){console.log('Database already contains users; seed leaves existing records unchanged.');process.exitCode=0;}
 else {
 const departments=[];
 for(const [name,description] of [['Roads & Infrastructure','Road repairs, pavements and public infrastructure.'],['Solid Waste Management','Waste collection, public bins and street cleaning.'],['Water & Drainage','Water supply, leaks and stormwater drainage.'],['Electrical Services','Streetlights and public electrical infrastructure.']])departments.push(await db.department.create({data:{name,description}}));
 const cats=[];
 for(const [name,icon,index]of [['Roads & potholes','road',0],['Garbage & cleanliness','waste',1],['Water supply','water',2],['Drainage & flooding','drain',2],['Streetlights','light',3],['Public spaces','park',0]])cats.push(await db.category.create({data:{name,icon,departmentId:departments[index].id}}));
 const passwordHash=await hashPassword(demoPassword);
 const citizen=await db.user.create({data:{name:'Aarav Sharma',email:'citizen@fixmycity.local',passwordHash,role:'CITIZEN'}});
 const neighbor=await db.user.create({data:{name:'Meera Desai',email:'neighbor@fixmycity.local',passwordHash,role:'CITIZEN'}});
 const admin=await db.user.create({data:{name:'Priya Kulkarni',email:'admin@fixmycity.local',passwordHash,role:'ADMIN'}});
 const officers=[];for(let i=0;i<4;i++)officers.push(await db.user.create({data:{name:['Rohan Patil','Sana Shaikh','Vikram Joshi','Anjali More'][i],email:i===0?'officer@fixmycity.local':`officer${i+1}@fixmycity.local`,passwordHash,role:'OFFICER',departmentId:departments[i].id}}));
 const examples=[
 ['Pothole near Andheri station entrance','A deep pothole at the station crossing is causing vehicles to swerve. The pavement edge also needs attention.','SV Road, near Andheri railway station','Andheri West','Mumbai',0,'IN_PROGRESS','URGENT',8,19.119,72.846],
 ['Overflowing bins at Dadar market','The collection point has not been cleared. Waste is spilling onto the footpath and blocking pedestrians.','Senapati Bapat Marg, flower market entrance','Dadar','Mumbai',1,'SUBMITTED','NORMAL',5,19.018,72.843],
 ['Streetlights out along SV Road','Three streetlights on the walking stretch have stopped working, making the footpath difficult to use after dark.','SV Road, opposite the municipal garden','Borivali West','Mumbai',4,'ASSIGNED','NORMAL',2,19.23,72.85],
 ['Water leak outside the community hall','Water has been flowing from the supply pipe onto the road since yesterday. Please inspect the connection.','Linking Road, beside the community hall','Bandra West','Mumbai',2,'RESOLVED','NORMAL',4,19.059,72.831],
 ['Blocked drain beside the bus stop','The roadside drain is clogged with debris and water collects across the crossing after rain.','Sion Trombay Road, near the main bus stop','Chembur','Mumbai',3,'IN_PROGRESS','URGENT',1,19.052,72.899],
 ['Damaged footpath near Shivaji Park','Several pavement slabs are loose at the park entrance. This creates a trip hazard for people walking in.','Shivaji Park main entrance','Dadar','Mumbai',5,'CLOSED','NORMAL',12,19.027,72.838],
 ['Uncollected waste beside the school','A pile of waste beside the school gate is attracting stray animals. The area needs regular collection.','Pant Nagar, near the municipal school','Ghatkopar East','Mumbai',1,'ASSIGNED','NORMAL',1,19.087,72.909],
 ['Road surface damaged at the junction','The road surface at the junction has broken into several uneven patches. Two wheelers are struggling to cross.','SV Road and station road junction','Andheri West','Mumbai',0,'SUBMITTED','NORMAL',1,19.119,72.846],
 ['Low water pressure in Mulund West','Residents on this stretch have had very low water pressure during morning supply hours for three days.','LBS Marg, opposite the public garden','Mulund West','Mumbai',2,'REOPENED','NORMAL',3,19.172,72.942],
 ['Streetlight flickers at the crossing','The streetlight at this pedestrian crossing flickers and switches off repeatedly throughout the evening.','LBS Marg, near the pedestrian crossing','Kurla','Mumbai',4,'SUBMITTED','NORMAL',0,19.073,72.881],
 ['Broken bench at the public garden','The bench next to the walking path has a broken seat and sharp edges. It should be repaired before further use.','Five Gardens, main walking path','Matunga','Mumbai',5,'RESOLVED','NORMAL',7,19.027,72.854],
 ['Drain cover missing on the footpath','An open drain without a cover makes this stretch unsafe. Please replace the cover and secure the area.','Sion Station Road, near the community hall','Sion','Mumbai',3,'ASSIGNED','URGENT',0,19.047,72.863]
 ];
 for(let i=0;i<examples.length;i++){
 const [title,description,address,ward,city,catIndex,status,priority,days,latitude,longitude]=examples[i];const category=cats[catIndex];const deptIndex=departments.findIndex(d=>d.id===category.departmentId);const createdAt=new Date(Date.now()-days*86400000-3600000);const assigned=!['SUBMITTED'].includes(status);const resolved=['RESOLVED','CLOSED'].includes(status);const reporter=i%3===0?citizen:neighbor;
 const c=await db.complaint.create({data:{id:`demo-${String(i+1).padStart(3,'0')}`,title,description,address,ward,city,categoryId:category.id,departmentId:category.departmentId,citizenId:reporter.id,officerId:assigned?officers[deptIndex].id:null,status,priority,latitude,longitude,createdAt,dueAt:new Date(createdAt.getTime()+(priority==='URGENT'?24:72)*3600000),resolvedAt:resolved?new Date(createdAt.getTime()+20*3600000):null,history:{create:[{status:'SUBMITTED',note:'Report received and automatically routed to the relevant department.',actorId:reporter.id,createdAt},...(assigned?[{status:'ASSIGNED',note:`Assigned to ${officers[deptIndex].name}.`,actorId:admin.id,createdAt:new Date(createdAt.getTime()+3600000)}]:[]),...(['IN_PROGRESS','RESOLVED','CLOSED','REOPENED'].includes(status)?[{status:'IN_PROGRESS',note:'Site inspected. The maintenance team has started work.',actorId:officers[deptIndex].id,createdAt:new Date(createdAt.getTime()+2*3600000)}]:[]),...(resolved?[{status:'RESOLVED',note:'Sample resolution: maintenance completed and inspected. This is fictional demonstration data.',actorId:officers[deptIndex].id,createdAt:new Date(createdAt.getTime()+20*3600000)}]:[]),...(status==='CLOSED'?[{status:'CLOSED',note:'Citizen confirmed the repair. Thank you for the update.',actorId:reporter.id,createdAt:new Date(createdAt.getTime()+24*3600000)}]:[]),...(status==='REOPENED'?[{status:'REOPENED',note:'Citizen requested a further inspection of the water supply.',actorId:reporter.id,createdAt:new Date(createdAt.getTime()+24*3600000)}]:[])]}}});
 if(i%2===0)await db.support.create({data:{userId:neighbor.id,complaintId:c.id}});
 if(status==='CLOSED')await db.feedback.create({data:{complaintId:c.id,userId:reporter.id,rating:5,comment:'The repair looks good. Thank you.',reopened:false}});
 }
 await db.notification.createMany({data:[{userId:citizen.id,complaintId:'demo-001',message:'Your Andheri station report is in progress. Rohan Patil is coordinating the repairs.'},{userId:admin.id,complaintId:'demo-002',message:'New report awaiting assignment: Overflowing bins at Dadar market.'},{userId:officers[0].id,complaintId:'demo-001',message:'You are assigned to the pothole report at Andheri station.'}]});
 console.log('Seeded 12 fictional reports, 6 categories, 4 departments and 7 demo users. Demo password: CityDemo!2026');
 }
}finally{await db.$disconnect();}
