import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const places = [
  ["Move Along Coffee","Food","Coffee · West Town","West Town","$",41.8957,-87.6830,"A walk-up coffee window with tea, pastries, and a skeleton mural.","https://www.movealongcoffee.com/"],
  ["Do-Rite Donuts","Food","Donuts · Multiple locations","The Loop","$",41.8840,-87.6245,"Excellent local donuts and breakfast sandwiches.","https://www.doritedonuts.com/"],
  ["Kasama","Food","Filipino · West Town","West Town","$$",41.8997,-87.6779,"A celebrated bakery known for the cardamom sticky bun.","https://www.kasamachicago.com/"],
  ["Pequod’s Pizza","Food","Deep dish · Lincoln Park","Lincoln Park","$$",41.9213,-87.6642,"Local deep dish with a famously caramelized crust.","https://pequodspizza.com/"],
  ["Green Street Smoked Meats","Food","BBQ · West Loop","West Loop","$$",41.8859,-87.6487,"Counter-service barbecue in a relaxed industrial room.","https://www.greenstreetmeats.com/"],
  ["Avec","Food","Mediterranean · West Loop","West Loop","$$$",41.8845,-87.6418,"Refined Mediterranean small plates in a lively setting.","https://www.avecrestaurant.com/"],
  ["Gilt Bar","Food","Restaurant · River North","River North","$$$$",41.8895,-87.6331,"Candlelit dining with classic cocktails.","https://www.giltbarchicago.com/"],
  ["Alinea","Food","Fine dining · Lincoln Park","Lincoln Park","$$$$",41.9134,-87.6481,"Chicago’s landmark theatrical fine-dining experience.","https://www.alinearestaurant.com/"],
  ["The Bean","Activities","Landmark · The Loop","The Loop","Free",41.8826,-87.6233,"Cloud Gate anchors Millennium Park and the city center.","https://www.choosechicago.com/articles/tours-and-attractions/the-bean/"],
  ["Grant Park","Activities","Park · The Loop","The Loop","Free",41.8756,-87.6197,"A grand lakefront park of gardens and fountains.","https://www.choosechicago.com/articles/parks-outdoors/grant-park/"],
  ["Chinatown","Activities","Neighborhood · Chinatown","Chinatown","Free",41.8525,-87.6328,"A lively neighborhood for markets and dim sum.","https://www.choosechicago.com/neighborhoods/chinatown/"],
  ["Navy Pier","Activities","Attraction · Streeterville","Streeterville","Free entry",41.8917,-87.6085,"Lakefront rides, gardens, and Chicago views.","https://navypier.org/"],
  ["Willis Tower","Activities","Observation · The Loop","The Loop","$$",41.8789,-87.6359,"Skydeck and the glass Ledge offer sweeping views.","https://theskydeck.com/"],
  ["360 Chicago","Activities","Observation · Streeterville","Streeterville","$$",41.8989,-87.6229,"Observation deck with TILT and a bar.","https://360chicago.com/"],
  ["Second City","Activities","Comedy · Old Town","Old Town","$$",41.9105,-87.6347,"Chicago comedy institution for sketch and improv.","https://www.secondcity.com/"],
  ["Alchemy Arts","Hidden Gems","Occult shop · Edgewater","Edgewater","Varies",41.9957,-87.6598,"A metaphysical bookstore and occult shop guarded by Marie.","https://www.instagram.com/alchemyartsoccult/"],
  ["The Last Chapter","Hidden Gems","Bookstore · Roscoe Village","Roscoe Village","Varies",41.9464,-87.6828,"A cozy romance-only bookstore with author events.","https://thelastchapterbookshop.com/"],
  ["Sideshow Gallery","Hidden Gems","Oddities · Bucktown","Bucktown","Varies",41.9079,-87.6803,"An eccentric shop of skulls, spells, and curiosities.","https://www.sideshowgallerychicago.com/"],
  ["Christkindlmarket","Seasonal","Winter market · The Loop","The Loop","Free entry",41.8832,-87.6241,"A festive German-style holiday market.","https://www.christkindlmarket.com/"],
  ["Maggie Daley Ice Ribbon","Seasonal","Winter · The Loop","The Loop","$",41.8813,-87.6218,"A looping skating ribbon in downtown Chicago.","https://maggiedaleypark.com/things-to-do-see/skating-ribbon/"],
  ["Lollapalooza","Seasonal","Summer · Grant Park","Grant Park","$$$$",41.8747,-87.6185,"A major summer music festival in Grant Park.","https://www.lollapalooza.com/"]
].map(([name,category,sub,neighborhood,budget,lat,lng,description,url]) => ({name,category,sub,neighborhood,budget,lat,lng,description,url}));

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-87.6318, 41.8818],
  zoom: 11.7,
  pitch: 0,
  bearing: -9,
  attributionControl: true,
  cooperativeGestures: false
});
map.addControl(new mapboxgl.NavigationControl({showCompass:false}), 'top-right');

let activeCategory = 'All';
let visiblePlaces = [...places];
const markers = new Map();

const categoryColors = {Food:'food', Activities:'activity', 'Hidden Gems':'hidden', Seasonal:'seasonal'};

function markerElement(place) {
  const el = document.createElement('button');
  el.className = `custom-marker ${categoryColors[place.category]}`;
  el.setAttribute('aria-label', place.name);
  el.addEventListener('click', () => showPlace(place));
  return el;
}

function renderPlaces(query = '') {
  markers.forEach(marker => marker.remove());
  markers.clear();
  visiblePlaces = places.filter(place => {
    const categoryMatch = activeCategory === 'All' || place.category === activeCategory;
    const haystack = `${place.name} ${place.sub} ${place.neighborhood} ${place.description}`.toLowerCase();
    return categoryMatch && haystack.includes(query.toLowerCase().trim());
  });
  document.getElementById('resultCount').textContent = `${visiblePlaces.length} place${visiblePlaces.length === 1 ? '' : 's'}`;
  visiblePlaces.forEach(place => {
    const marker = new mapboxgl.Marker({element: markerElement(place), anchor:'center'})
      .setLngLat([place.lng, place.lat]).addTo(map);
    markers.set(place.name, marker);
  });
}

function showPlace(place) {
  document.getElementById('panelContent').innerHTML = `<article class="place-card">
    <div class="category">${place.category} · ${place.sub.split('·')[0].trim()}</div>
    <h2>${place.name}</h2>
    <p class="description">${place.description}</p>
    <div class="place-meta"><div><span>Neighborhood</span><b>${place.neighborhood}</b></div><div><span>Cost</span><b>${place.budget}</b></div></div>
    ${place.url ? `<a class="place-link" href="${place.url}" target="_blank" rel="noopener">Visit website <span>↗</span></a>` : ''}
  </article>`;
  map.easeTo({center:[place.lng, place.lat], zoom:13.2, duration:900});
  document.getElementById('closePanel').style.visibility = 'visible';
}

function resetPanel() {
  document.getElementById('panelContent').innerHTML = `<p class="eyebrow">Field Guide No. 01</p>
    <h1>Explore<br><em>Chicago.</em></h1>
    <p class="deck">A hand-picked map of breakfast counters, deep-dish institutions, neighborhood oddities, and city essentials.</p>
    <div class="rule"></div>
    <div class="legend"><div><span class="legend-dot food"></span> Food & Drink</div><div><span class="legend-dot activity"></span> Activities</div><div><span class="legend-dot hidden"></span> Hidden Gems</div><div><span class="legend-dot seasonal"></span> Seasonal</div></div>`;
  document.getElementById('closePanel').style.visibility = 'hidden';
}

document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-link').forEach(b => b.classList.remove('active'));
  button.classList.add('active');
  activeCategory = button.dataset.category;
  renderPlaces(document.getElementById('placeSearch').value);
  resetPanel();
}));
document.getElementById('placeSearch').addEventListener('input', event => renderPlaces(event.target.value));
document.getElementById('closePanel').addEventListener('click', resetPanel);
document.getElementById('closePanel').style.visibility = 'hidden';
document.getElementById('randomPlace').addEventListener('click', () => {
  const pool = visiblePlaces.length ? visiblePlaces : places;
  showPlace(pool[Math.floor(Math.random() * pool.length)]);
});
document.getElementById('locateButton').addEventListener('click', () => {
  navigator.geolocation?.getCurrentPosition(position => {
    map.easeTo({center:[position.coords.longitude, position.coords.latitude], zoom:14, duration:900});
  });
});

map.on('load', () => {
  map.setPaintProperty('water', 'fill-color', '#c8cfc6');
  map.setPaintProperty('land', 'background-color', '#eee5cf');
  renderPlaces();
});
