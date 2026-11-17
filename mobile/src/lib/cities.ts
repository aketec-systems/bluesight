/**
 * Cities you can search from anywhere, built in so picking one costs no data (no geocoding calls).
 * Coordinates are city centres; the server snaps them to its 2 km grid like any location.
 * Order within a region is roughly "most searched first". Add freely: name, country, lat, lon.
 */
export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export const CITY_REGIONS: { region: string; cities: City[] }[] = [
  {
    region: 'West Africa',
    cities: [
      { name: 'Monrovia', country: 'Liberia', lat: 6.3007, lon: -10.7969 },
      { name: 'Gbarnga', country: 'Liberia', lat: 6.9956, lon: -9.4722 },
      { name: 'Buchanan', country: 'Liberia', lat: 5.8808, lon: -10.0467 },
      { name: 'Kakata', country: 'Liberia', lat: 6.5302, lon: -10.3537 },
      { name: 'Ganta', country: 'Liberia', lat: 7.2333, lon: -8.9833 },
      { name: 'Harper', country: 'Liberia', lat: 4.375, lon: -7.7169 },
      { name: 'Accra', country: 'Ghana', lat: 5.6037, lon: -0.187 },
      { name: 'Kumasi', country: 'Ghana', lat: 6.6885, lon: -1.6244 },
      { name: 'Takoradi', country: 'Ghana', lat: 4.934, lon: -1.7137 },
      { name: 'Tamale', country: 'Ghana', lat: 9.4008, lon: -0.8393 },
      { name: 'Lagos', country: 'Nigeria', lat: 6.5244, lon: 3.3792 },
      { name: 'Abuja', country: 'Nigeria', lat: 9.0765, lon: 7.3986 },
      { name: 'Port Harcourt', country: 'Nigeria', lat: 4.8156, lon: 7.0498 },
      { name: 'Ibadan', country: 'Nigeria', lat: 7.3775, lon: 3.947 },
      { name: 'Enugu', country: 'Nigeria', lat: 6.4584, lon: 7.5464 },
      { name: 'Benin City', country: 'Nigeria', lat: 6.335, lon: 5.6037 },
      { name: 'Kano', country: 'Nigeria', lat: 12.0022, lon: 8.592 },
      { name: 'Freetown', country: 'Sierra Leone', lat: 8.4657, lon: -13.2317 },
      { name: 'Bo', country: 'Sierra Leone', lat: 7.9647, lon: -11.7383 },
      { name: 'Conakry', country: 'Guinea', lat: 9.6412, lon: -13.5784 },
      { name: 'Abidjan', country: "Côte d'Ivoire", lat: 5.36, lon: -4.0083 },
      { name: 'Dakar', country: 'Senegal', lat: 14.7167, lon: -17.4677 },
      { name: 'Banjul', country: 'The Gambia', lat: 13.4549, lon: -16.579 },
      { name: 'Bamako', country: 'Mali', lat: 12.6392, lon: -8.0029 },
      { name: 'Ouagadougou', country: 'Burkina Faso', lat: 12.3714, lon: -1.5197 },
      { name: 'Lomé', country: 'Togo', lat: 6.1256, lon: 1.2254 },
      { name: 'Cotonou', country: 'Benin', lat: 6.3703, lon: 2.3912 },
      { name: 'Niamey', country: 'Niger', lat: 13.5116, lon: 2.1254 },
      { name: 'Bissau', country: 'Guinea-Bissau', lat: 11.8817, lon: -15.6178 },
      { name: 'Praia', country: 'Cape Verde', lat: 14.933, lon: -23.5133 },
      { name: 'Nouakchott', country: 'Mauritania', lat: 18.0735, lon: -15.9582 },
    ],
  },
  {
    region: 'Central Africa',
    cities: [
      { name: 'Kinshasa', country: 'DR Congo', lat: -4.4419, lon: 15.2663 },
      { name: 'Lubumbashi', country: 'DR Congo', lat: -11.6609, lon: 27.4794 },
      { name: 'Brazzaville', country: 'Republic of the Congo', lat: -4.2634, lon: 15.2429 },
      { name: 'Douala', country: 'Cameroon', lat: 4.0511, lon: 9.7679 },
      { name: 'Yaoundé', country: 'Cameroon', lat: 3.848, lon: 11.5021 },
      { name: 'Libreville', country: 'Gabon', lat: 0.4162, lon: 9.4673 },
      { name: 'Luanda', country: 'Angola', lat: -8.839, lon: 13.2894 },
      { name: 'Malabo', country: 'Equatorial Guinea', lat: 3.7504, lon: 8.7371 },
      { name: 'Bangui', country: 'Central African Republic', lat: 4.3947, lon: 18.5582 },
      { name: "N'Djamena", country: 'Chad', lat: 12.1348, lon: 15.0557 },
    ],
  },
  {
    region: 'East Africa',
    cities: [
      { name: 'Nairobi', country: 'Kenya', lat: -1.2921, lon: 36.8219 },
      { name: 'Mombasa', country: 'Kenya', lat: -4.0435, lon: 39.6682 },
      { name: 'Kisumu', country: 'Kenya', lat: -0.0917, lon: 34.768 },
      { name: 'Kampala', country: 'Uganda', lat: 0.3476, lon: 32.5825 },
      { name: 'Kigali', country: 'Rwanda', lat: -1.9441, lon: 30.0619 },
      { name: 'Bujumbura', country: 'Burundi', lat: -3.3614, lon: 29.3599 },
      { name: 'Dar es Salaam', country: 'Tanzania', lat: -6.7924, lon: 39.2083 },
      { name: 'Arusha', country: 'Tanzania', lat: -3.3869, lon: 36.683 },
      { name: 'Zanzibar City', country: 'Tanzania', lat: -6.1659, lon: 39.2026 },
      { name: 'Addis Ababa', country: 'Ethiopia', lat: 9.03, lon: 38.74 },
      { name: 'Asmara', country: 'Eritrea', lat: 15.3229, lon: 38.9251 },
      { name: 'Mogadishu', country: 'Somalia', lat: 2.0469, lon: 45.3182 },
      { name: 'Hargeisa', country: 'Somaliland', lat: 9.56, lon: 44.065 },
      { name: 'Djibouti', country: 'Djibouti', lat: 11.5721, lon: 43.1456 },
      { name: 'Juba', country: 'South Sudan', lat: 4.8594, lon: 31.5713 },
      { name: 'Khartoum', country: 'Sudan', lat: 15.5007, lon: 32.5599 },
    ],
  },
  {
    region: 'Southern Africa',
    cities: [
      { name: 'Johannesburg', country: 'South Africa', lat: -26.2041, lon: 28.0473 },
      { name: 'Cape Town', country: 'South Africa', lat: -33.9249, lon: 18.4241 },
      { name: 'Durban', country: 'South Africa', lat: -29.8587, lon: 31.0218 },
      { name: 'Pretoria', country: 'South Africa', lat: -25.7479, lon: 28.2293 },
      { name: 'Harare', country: 'Zimbabwe', lat: -17.8252, lon: 31.0335 },
      { name: 'Bulawayo', country: 'Zimbabwe', lat: -20.1325, lon: 28.6265 },
      { name: 'Lusaka', country: 'Zambia', lat: -15.3875, lon: 28.3228 },
      { name: 'Lilongwe', country: 'Malawi', lat: -13.9626, lon: 33.7741 },
      { name: 'Blantyre', country: 'Malawi', lat: -15.7861, lon: 35.0058 },
      { name: 'Maputo', country: 'Mozambique', lat: -25.9692, lon: 32.5732 },
      { name: 'Gaborone', country: 'Botswana', lat: -24.6282, lon: 25.9231 },
      { name: 'Windhoek', country: 'Namibia', lat: -22.5609, lon: 17.0658 },
      { name: 'Antananarivo', country: 'Madagascar', lat: -18.8792, lon: 47.5079 },
      { name: 'Port Louis', country: 'Mauritius', lat: -20.1609, lon: 57.5012 },
    ],
  },
  {
    region: 'North Africa',
    cities: [
      { name: 'Cairo', country: 'Egypt', lat: 30.0444, lon: 31.2357 },
      { name: 'Alexandria', country: 'Egypt', lat: 31.2001, lon: 29.9187 },
      { name: 'Casablanca', country: 'Morocco', lat: 33.5731, lon: -7.5898 },
      { name: 'Rabat', country: 'Morocco', lat: 34.0209, lon: -6.8416 },
      { name: 'Marrakesh', country: 'Morocco', lat: 31.6295, lon: -7.9811 },
      { name: 'Tunis', country: 'Tunisia', lat: 36.8065, lon: 10.1815 },
      { name: 'Algiers', country: 'Algeria', lat: 36.7538, lon: 3.0588 },
      { name: 'Tripoli', country: 'Libya', lat: 32.8872, lon: 13.1913 },
    ],
  },
  {
    region: 'Caribbean and South America',
    cities: [
      { name: 'Kingston', country: 'Jamaica', lat: 17.9714, lon: -76.7936 },
      { name: 'Montego Bay', country: 'Jamaica', lat: 18.4762, lon: -77.8939 },
      { name: 'Port-au-Prince', country: 'Haiti', lat: 18.5944, lon: -72.3074 },
      { name: 'Port of Spain', country: 'Trinidad and Tobago', lat: 10.6549, lon: -61.5019 },
      { name: 'Bridgetown', country: 'Barbados', lat: 13.0975, lon: -59.6167 },
      { name: 'Nassau', country: 'Bahamas', lat: 25.0443, lon: -77.3504 },
      { name: 'Santo Domingo', country: 'Dominican Republic', lat: 18.4861, lon: -69.9312 },
      { name: 'Georgetown', country: 'Guyana', lat: 6.8013, lon: -58.1551 },
      { name: 'Salvador', country: 'Brazil', lat: -12.9777, lon: -38.5016 },
    ],
  },
  {
    region: 'Diaspora cities',
    cities: [
      { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.006 },
      { name: 'Washington, DC', country: 'USA', lat: 38.9072, lon: -77.0369 },
      { name: 'Atlanta', country: 'USA', lat: 33.749, lon: -84.388 },
      { name: 'Houston', country: 'USA', lat: 29.7604, lon: -95.3698 },
      { name: 'Dallas', country: 'USA', lat: 32.7767, lon: -96.797 },
      { name: 'Minneapolis', country: 'USA', lat: 44.9778, lon: -93.265 },
      { name: 'Philadelphia', country: 'USA', lat: 39.9526, lon: -75.1652 },
      { name: 'Providence', country: 'USA', lat: 41.824, lon: -71.4128 },
      { name: 'Boston', country: 'USA', lat: 42.3601, lon: -71.0589 },
      { name: 'Chicago', country: 'USA', lat: 41.8781, lon: -87.6298 },
      { name: 'Charlotte', country: 'USA', lat: 35.2271, lon: -80.8431 },
      { name: 'Columbus', country: 'USA', lat: 39.9612, lon: -82.9988 },
      { name: 'Los Angeles', country: 'USA', lat: 34.0522, lon: -118.2437 },
      { name: 'Seattle', country: 'USA', lat: 47.6062, lon: -122.3321 },
      { name: 'Toronto', country: 'Canada', lat: 43.6532, lon: -79.3832 },
      { name: 'Montreal', country: 'Canada', lat: 45.5017, lon: -73.5673 },
      { name: 'London', country: 'UK', lat: 51.5072, lon: -0.1276 },
      { name: 'Manchester', country: 'UK', lat: 53.4808, lon: -2.2426 },
      { name: 'Birmingham', country: 'UK', lat: 52.4862, lon: -1.8904 },
      { name: 'Dublin', country: 'Ireland', lat: 53.3498, lon: -6.2603 },
      { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
      { name: 'Brussels', country: 'Belgium', lat: 50.8503, lon: 4.3517 },
      { name: 'Amsterdam', country: 'Netherlands', lat: 52.3676, lon: 4.9041 },
      { name: 'Berlin', country: 'Germany', lat: 52.52, lon: 13.405 },
      { name: 'Lisbon', country: 'Portugal', lat: 38.7223, lon: -9.1393 },
      { name: 'Madrid', country: 'Spain', lat: 40.4168, lon: -3.7038 },
      { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
    ],
  },
];

const FOLD: Record<string, string> = { é: 'e', è: 'e', ê: 'e', ô: 'o', ç: 'c', ã: 'a', á: 'a', í: 'i', ó: 'o', ú: 'u', ñ: 'n' };
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/[éèêôçãáíóúñ]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim();

/** Cities whose name or country starts a word matching the query (accents ignored). */
export function searchCities(query: string) {
  const q = fold(query);
  if (!q) return CITY_REGIONS;
  return CITY_REGIONS.map((r) => ({
    region: r.region,
    cities: r.cities.filter((c) => {
      const hay = ` ${fold(c.name)} ${fold(c.country)}`;
      return hay.includes(` ${q}`);
    }),
  })).filter((r) => r.cities.length > 0);
}
