export const BOT_TIME_ZONE = "Europe/Istanbul";
export const PERSIAN_MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const breaks = [-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function div(a:number,b:number){return ~~(a/b)}
function jalCal(jy:number){let bl=breaks.length, gy=jy+621, leapJ=-14,jp=breaks[0],jm=0,jump=0,n=0,i=1;if(jy<jp||jy>=breaks[bl-1])throw new Error("Invalid Jalali year");for(;i<bl;i++){jm=breaks[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(jump%33,4);jp=jm}n=jy-jp;leapJ+=div(n,33)*8+div((n%33)+3,4);if(jump%33===4&&jump-n===4)leapJ++;const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;const march=20+leapJ-leapG;if(jump-n<6)n=n-jump+div(jump+4,33)*33;let leap=((n+1)%33)-1;if(leap===-1)leap=4;return{leap,gy,march}}
function g2d(gy:number,gm:number,gd:number){let d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*((gm+9)%12)+2,5)+gd-34840408;d=d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752;return d}
function d2g(jdn:number){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div((j%1461),4)*5+308;const gd=div((i%153),5)+1;const gm=((div(i,153)%12)+1);const gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd}}
function j2d(jy:number,jm:number,jd:number){const r=jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1}
export function isJalaliLeapYear(jy:number){return jalCal(jy).leap===0}
export function jalaliMonthLength(jy:number,jm:number){if(jm<=6)return 31;if(jm<=11)return 30;return isJalaliLeapYear(jy)?30:29}
export function jalaliToGregorian(jy:number,jm:number,jd:number){return d2g(j2d(jy,jm,jd))}
export function zonedJalaliToUtcDate(jy:number,jm:number,jd:number,hour:number,minute:number,timeZone=BOT_TIME_ZONE){const g=jalaliToGregorian(jy,jm,jd);const guess=new Date(Date.UTC(g.gy,g.gm-1,g.gd,hour,minute));const parts=new Intl.DateTimeFormat("en-US",{timeZone,hour12:false,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(guess);const val=(t:string)=>Number(parts.find(p=>p.type===t)?.value);const asUTC=Date.UTC(val("year"),val("month")-1,val("day"),val("hour"),val("minute"),val("second"));return new Date(guess.getTime()-(asUTC-guess.getTime()))}
export function currentJalaliYear(date=new Date(),timeZone=BOT_TIME_ZONE){const y=Number(new Intl.DateTimeFormat("en-US-u-ca-persian",{timeZone,year:"numeric"}).format(date));return y}
export function formatJalaliDateTime(date:Date,timeZone=BOT_TIME_ZONE){return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone,year:"numeric",month:"long",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(date))}
