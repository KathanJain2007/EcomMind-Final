/** Indian cities for location search. Works without Google Places and before sign-in. */

export interface City {
  name: string
  state: string
}

const BY_STATE: Record<string, string> = {
  'Andhra Pradesh': 'Visakhapatnam,Vijayawada,Guntur,Nellore,Kurnool,Kakinada,Rajahmundry,Tirupati,Kadapa,Anantapur,Eluru,Ongole,Vizianagaram,Chittoor,Machilipatnam,Tenali,Hindupur,Bhimavaram,Proddatur,Adoni,Nandyal',
  'Arunachal Pradesh': 'Itanagar,Naharlagun,Pasighat,Tawang',
  Assam: 'Guwahati,Silchar,Dibrugarh,Jorhat,Nagaon,Tinsukia,Tezpur,Bongaigaon,Dhubri',
  Bihar: 'Patna,Gaya,Bhagalpur,Muzaffarpur,Darbhanga,Purnia,Arrah,Begusarai,Katihar,Munger,Chapra,Bettiah,Motihari,Saharsa,Hajipur,Sasaram,Dehri,Siwan,Bihar Sharif,Buxar',
  Chhattisgarh: 'Raipur,Bhilai,Bilaspur,Korba,Durg,Rajnandgaon,Jagdalpur,Raigarh,Ambikapur',
  Goa: 'Panaji,Margao,Vasco da Gama,Mapusa,Ponda',
  Gujarat: 'Ahmedabad,Surat,Vadodara,Rajkot,Bhavnagar,Jamnagar,Junagadh,Gandhinagar,Anand,Nadiad,Morbi,Mehsana,Bharuch,Vapi,Navsari,Valsad,Porbandar,Godhra,Bhuj,Palanpur,Gandhidham,Veraval,Surendranagar,Botad',
  Haryana: 'Gurugram,Faridabad,Panipat,Ambala,Yamunanagar,Rohtak,Hisar,Karnal,Sonipat,Panchkula,Bhiwani,Sirsa,Rewari,Jind,Kaithal,Kurukshetra,Bahadurgarh,Palwal',
  'Himachal Pradesh': 'Shimla,Dharamshala,Solan,Mandi,Kullu,Manali,Baddi,Hamirpur,Una,Bilaspur (HP)',
  Jharkhand: 'Ranchi,Jamshedpur,Dhanbad,Bokaro,Deoghar,Hazaribagh,Giridih,Ramgarh,Phusro',
  Karnataka: 'Bengaluru,Mysuru,Mangaluru,Hubballi,Dharwad,Belagavi,Kalaburagi,Ballari,Vijayapura,Shivamogga,Tumakuru,Davanagere,Bidar,Udupi,Hassan,Raichur,Bagalkot,Chikkamagaluru,Mandya,Gadag,Kolar,Karwar',
  Kerala: 'Thiruvananthapuram,Kochi,Kozhikode,Thrissur,Kollam,Kannur,Alappuzha,Palakkad,Kottayam,Malappuram,Kasaragod,Pathanamthitta,Idukki,Wayanad',
  'Madhya Pradesh': 'Indore,Bhopal,Jabalpur,Gwalior,Ujjain,Sagar,Dewas,Satna,Ratlam,Rewa,Burhanpur,Khandwa,Morena,Bhind,Chhindwara,Guna,Shivpuri,Vidisha,Damoh,Mandsaur,Neemuch,Betul,Singrauli',
  Maharashtra: 'Mumbai,Pune,Nagpur,Thane,Nashik,Aurangabad,Solapur,Kolhapur,Amravati,Navi Mumbai,Kalyan,Vasai,Akola,Latur,Dhule,Ahmednagar,Chandrapur,Parbhani,Jalgaon,Bhiwandi,Nanded,Sangli,Satara,Malegaon,Ratnagiri,Wardha,Beed,Yavatmal,Pimpri-Chinchwad,Ulhasnagar,Panvel,Baramati',
  Manipur: 'Imphal,Thoubal,Churachandpur',
  Meghalaya: 'Shillong,Tura,Jowai',
  Mizoram: 'Aizawl,Lunglei',
  Nagaland: 'Kohima,Dimapur,Mokokchung',
  Odisha: 'Bhubaneswar,Cuttack,Rourkela,Berhampur,Sambalpur,Puri,Balasore,Bhadrak,Baripada,Jharsuguda',
  Punjab: 'Ludhiana,Amritsar,Jalandhar,Patiala,Bathinda,Mohali,Hoshiarpur,Moga,Pathankot,Firozpur,Batala,Abohar,Malerkotla,Khanna,Phagwara,Muktsar,Barnala,Kapurthala',
  Rajasthan: 'Jaipur,Jodhpur,Udaipur,Kota,Bikaner,Ajmer,Alwar,Bhilwara,Bharatpur,Sikar,Pali,Sri Ganganagar,Tonk,Barmer,Jaisalmer,Churu,Nagaur,Hanumangarh,Beawar,Kishangarh,Banswara,Dungarpur,Chittorgarh,Bundi,Jhunjhunu,Dausa',
  Sikkim: 'Gangtok,Namchi',
  'Tamil Nadu': 'Chennai,Coimbatore,Madurai,Tiruchirappalli,Salem,Tirunelveli,Tiruppur,Erode,Vellore,Thoothukudi,Thanjavur,Dindigul,Nagercoil,Hosur,Kanchipuram,Karur,Cuddalore,Kumbakonam,Sivakasi,Ooty,Avadi',
  Telangana: 'Hyderabad,Warangal,Nizamabad,Karimnagar,Khammam,Ramagundam,Mahbubnagar,Nalgonda,Adilabad,Secunderabad,Siddipet,Suryapet',
  Tripura: 'Agartala,Udaipur (Tripura),Dharmanagar',
  'Uttar Pradesh': 'Lucknow,Kanpur,Ghaziabad,Agra,Varanasi,Meerut,Prayagraj,Noida,Greater Noida,Bareilly,Aligarh,Moradabad,Saharanpur,Gorakhpur,Firozabad,Jhansi,Muzaffarnagar,Mathura,Ayodhya,Rampur,Shahjahanpur,Farrukhabad,Mirzapur,Bulandshahr,Sitapur,Etawah,Hapur,Budaun,Basti,Azamgarh,Unnao,Lakhimpur,Hardoi,Rae Bareli,Faizabad',
  Uttarakhand: 'Dehradun,Haridwar,Haldwani,Roorkee,Rudrapur,Kashipur,Rishikesh,Nainital',
  'West Bengal': 'Kolkata,Howrah,Durgapur,Asansol,Siliguri,Bardhaman,Malda,Kharagpur,Haldia,Darjeeling,Baharampur,Krishnanagar,Barasat,Habra,Jalpaiguri,Bankura,Purulia,Cooch Behar',
  Delhi: 'New Delhi,Delhi,Dwarka,Rohini',
  'Jammu and Kashmir': 'Srinagar,Jammu,Anantnag,Baramulla,Udhampur,Kathua',
  Ladakh: 'Leh,Kargil',
  Chandigarh: 'Chandigarh',
  Puducherry: 'Puducherry,Karaikal',
  'Andaman and Nicobar Islands': 'Port Blair',
  'Dadra and Nagar Haveli and Daman and Diu': 'Daman,Silvassa,Diu',
  Lakshadweep: 'Kavaratti',
}

/** Old and alternate names people still type. */
const ALIASES: Record<string, string[]> = {
  Bengaluru: ['Bangalore'],
  Mumbai: ['Bombay'],
  Chennai: ['Madras'],
  Kolkata: ['Calcutta'],
  Gurugram: ['Gurgaon'],
  Prayagraj: ['Allahabad'],
  Varanasi: ['Banaras', 'Benares'],
  Puducherry: ['Pondicherry'],
  Thiruvananthapuram: ['Trivandrum'],
  Kochi: ['Cochin'],
  Mysuru: ['Mysore'],
  Mangaluru: ['Mangalore'],
  Vadodara: ['Baroda'],
  Hubballi: ['Hubli'],
  Belagavi: ['Belgaum'],
  Kalaburagi: ['Gulbarga'],
  Ballari: ['Bellary'],
  Shivamogga: ['Shimoga'],
  Tumakuru: ['Tumkur'],
  Tiruchirappalli: ['Trichy'],
  Thoothukudi: ['Tuticorin'],
  Kozhikode: ['Calicut'],
  Thrissur: ['Trichur'],
  Alappuzha: ['Alleppey'],
  Visakhapatnam: ['Vizag'],
  Rajahmundry: ['Rajamahendravaram'],
  Mohali: ['Sahibzada Ajit Singh Nagar'],
  Aurangabad: ['Chhatrapati Sambhajinagar'],
}

export const CITIES: City[] = Object.entries(BY_STATE)
  .flatMap(([state, names]) => names.split(',').map((name) => ({ name, state })))
  .sort((a, b) => a.name.localeCompare(b.name))

const startsWith = (c: City, q: string) =>
  c.name.toLowerCase().startsWith(q) || (ALIASES[c.name] ?? []).some((a) => a.toLowerCase().startsWith(q))

/**
 * Every city starting with what was typed ("b" lists all the B cities). From two
 * letters on, it also finds matches inside a name or by state ("pur", "kerala").
 */
export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const first = CITIES.filter((c) => startsWith(c, q))
  if (q.length < 2) return first
  const rest = CITIES.filter((c) => !startsWith(c, q) && (c.name.toLowerCase().includes(q) || c.state.toLowerCase().includes(q)))
  return [...first, ...rest]
}

export const cityLabel = (c: City) => `${c.name}, ${c.state}, India`
