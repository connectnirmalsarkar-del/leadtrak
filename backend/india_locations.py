"""Seed data: Indian States/UTs and their major cities.
Used to populate the `locations` collection on first boot. Super Admin can add/edit/delete cities later.
"""

INDIA_LOCATIONS = {
    "Andhra Pradesh": ["Visakhapatnam", "Vijayawada", "Guntur", "Tirupati", "Nellore", "Kurnool", "Rajahmundry", "Kakinada"],
    "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat", "Tawang", "Ziro"],
    "Assam": ["Guwahati", "Dibrugarh", "Silchar", "Jorhat", "Nagaon", "Tezpur", "Tinsukia"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia", "Begusarai", "Ara"],
    "Chhattisgarh": ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg", "Rajnandgaon"],
    "Goa": ["Panaji", "Margao", "Vasco da Gama", "Mapusa", "Ponda"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Gandhinagar", "Junagadh", "Jamnagar"],
    "Haryana": ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar", "Rohtak", "Sonipat"],
    "Himachal Pradesh": ["Shimla", "Manali", "Dharamshala", "Solan", "Mandi", "Kullu", "Hamirpur"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Hazaribagh", "Deoghar"],
    "Karnataka": ["Bengaluru", "Mysuru", "Mangaluru", "Hubballi", "Belagavi", "Davanagere", "Ballari", "Tumakuru"],
    "Kerala": ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur", "Alappuzha", "Palakkad"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain", "Sagar", "Dewas", "Satna"],
    "Maharashtra": ["Mumbai", "Pune", "Nagpur", "Nashik", "Aurangabad", "Thane", "Solapur", "Kolhapur", "Navi Mumbai"],
    "Manipur": ["Imphal", "Thoubal", "Bishnupur", "Churachandpur"],
    "Meghalaya": ["Shillong", "Tura", "Jowai", "Nongstoin"],
    "Mizoram": ["Aizawl", "Lunglei", "Champhai"],
    "Nagaland": ["Kohima", "Dimapur", "Mokokchung", "Tuensang"],
    "Odisha": ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur", "Puri"],
    "Punjab": ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali", "Pathankot"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer", "Bhilwara", "Alwar"],
    "Sikkim": ["Gangtok", "Namchi", "Geyzing", "Mangan"],
    "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem", "Tirunelveli", "Erode", "Vellore"],
    "Telangana": ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam", "Mahbubnagar"],
    "Tripura": ["Agartala", "Dharmanagar", "Udaipur", "Kailashahar"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Ghaziabad", "Agra", "Varanasi", "Meerut", "Noida", "Prayagraj", "Bareilly", "Aligarh"],
    "Uttarakhand": ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Nainital", "Rishikesh"],
    "West Bengal": [
        # Major Cities (already in original seed)
        "Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri", "Bardhaman", "Malda", "Kharagpur",
        # Greater Kolkata Metropolitan Area
        "Bidhannagar", "New Town", "Rajarhat", "Salt Lake", "Dum Dum", "South Dum Dum", "Baranagar",
        "Kamarhati", "Panihati", "Khardaha", "Titagarh", "Barrackpore", "North Barrackpore",
        "New Barrackpore", "Naihati", "Halisahar", "Kanchrapara", "Bhatpara", "Jagatdal", "Garulia",
        "Madhyamgram", "Barasat", "Habra", "Ashokenagar", "Basirhat", "Bongaon", "Taki",
        "Maheshtala", "Budge Budge", "Pujali", "Rajpur Sonarpur", "Baruipur", "Diamond Harbour",
        # Hooghly District
        "Chinsurah", "Chandannagar", "Serampore", "Uttarpara", "Konnagar", "Rishra", "Bhadreswar",
        "Baidyabati", "Dankuni", "Hooghly", "Bansberia", "Tarakeshwar", "Arambagh", "Singur",
        "Pandua", "Polba", "Mogra", "Balagarh", "Khanakul",
        # Nadia
        "Krishnanagar", "Kalyani", "Ranaghat", "Santipur", "Nabadwip", "Chakdaha", "Tehatta",
        "Karimpur", "Kalna",
        # Murshidabad
        "Berhampore", "Murshidabad", "Jangipur", "Kandi", "Lalbagh", "Domkal", "Beldanga",
        "Farakka", "Dhulian",
        # Birbhum
        "Suri", "Bolpur", "Santiniketan", "Rampurhat", "Sainthia", "Dubrajpur", "Nalhati",
        "Murarai", "Mayureshwar",
        # Burdwan / Bardhaman East & West
        "Memari", "Katwa", "Dainhat", "Guskara", "Kalna", "Jamalpur", "Raniganj", "Jamuria",
        "Kulti", "Andal", "Pandabeswar", "Ondal", "Salanpur", "Barabani",
        # Purulia
        "Purulia", "Raghunathpur", "Adra", "Jhalda", "Manbazar", "Balarampur",
        # Bankura
        "Bankura", "Bishnupur", "Sonamukhi", "Khatra", "Indpur", "Mejia",
        # Jhargram
        "Jhargram", "Belpahari", "Binpur",
        # Paschim Medinipur (West Midnapore)
        "Midnapore", "Belda", "Garhbeta", "Chandrakona", "Khirpai", "Ramjibanpur", "Ghatal",
        "Daspur", "Keshpur",
        # Purba Medinipur (East Midnapore)
        "Tamluk", "Haldia", "Contai", "Egra", "Panskura", "Digha", "Mecheda", "Mahishadal",
        "Nandigram",
        # Malda
        "English Bazar", "Old Malda", "Chanchal", "Ratua", "Manikchak", "Harishchandrapur",
        # Uttar Dinajpur
        "Raiganj", "Islampur", "Dalkhola", "Kaliyaganj", "Karandighi", "Chopra", "Goalpokhar",
        "Hemtabad", "Itahar",
        # Dakshin Dinajpur
        "Balurghat", "Gangarampur", "Buniadpur", "Kumarganj", "Tapan", "Hili",
        # Jalpaiguri
        "Jalpaiguri", "Dhupguri", "Maynaguri", "Mal Bazar", "Nagrakata", "Banarhat", "Mainaguri",
        # Alipurduar
        "Alipurduar", "Falakata", "Madarihat", "Birpara", "Jaigaon", "Kumargram",
        # Cooch Behar
        "Cooch Behar", "Dinhata", "Mathabhanga", "Mekhliganj", "Sitalkuchi", "Sitai",
        "Tufanganj", "Haldibari",
        # Darjeeling
        "Darjeeling", "Kurseong", "Mirik", "Sukhia Pokhri", "Sonada", "Ghoom",
        # Kalimpong
        "Kalimpong", "Pedong", "Algarah", "Gorubathan", "Lava",
    ],
    # Union Territories
    "Andaman and Nicobar Islands": ["Port Blair"],
    "Chandigarh": ["Chandigarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Silvassa", "Daman", "Diu"],
    "Delhi": ["New Delhi", "Central Delhi", "South Delhi", "North Delhi", "East Delhi", "West Delhi", "Dwarka", "Rohini"],
    "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla", "Udhampur"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti"],
    "Puducherry": ["Puducherry", "Karaikal", "Mahe", "Yanam"],
}
