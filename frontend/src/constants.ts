
import { SafetyCategory, SafetyNode, CoTraveller } from './types';

// Updated mock data centered around the user's provided demo coordinates (18.620029, 73.747434)
export const MOCK_NODES: SafetyNode[] = [
  {
    id: '1',
    type: 'shop',
    label: 'Community General Store',
    psi: 96,
    coordinates: { lat: 18.620100, lng: 73.747500 },
    categories: [SafetyCategory.OPEN_SHOPS, SafetyCategory.HELPFUL_LOCALS],
    lastUpdate: '2 mins ago',
    description: 'Brightly lit storefront, shopkeeper active. Known helpful location.'
  },
  {
    id: '2',
    type: 'transit',
    label: 'Auto-Rickshaw Cluster',
    psi: 84,
    coordinates: { lat: 18.619800, lng: 73.747200 },
    categories: [SafetyCategory.TRANSIT_HUB, SafetyCategory.ACTIVE_PRESENCE],
    lastUpdate: 'Just now',
    description: 'Frequent rickshaw movement and well-lit corner.'
  },
  {
    id: '3',
    type: 'community',
    label: 'Safe Public Hub',
    psi: 72,
    coordinates: { lat: 18.620500, lng: 73.748000 },
    categories: [SafetyCategory.COMFORTABLE, SafetyCategory.ACTIVE_PRESENCE],
    lastUpdate: '10 mins ago',
    description: 'Active pedestrian flow with families nearby.'
  },
  {
    id: '4',
    type: 'shop',
    label: 'Late Night Pharmacy',
    psi: 91,
    coordinates: { lat: 18.619000, lng: 73.746500 },
    categories: [SafetyCategory.OPEN_SHOPS, SafetyCategory.HELPFUL_LOCALS],
    lastUpdate: '5 mins ago',
    description: 'Highly visible LEDs, CCTV monitoring on-site.'
  },
  {
    id: '5',
    type: 'street_light',
    label: 'High Visibility Crossroad',
    psi: 95,
    coordinates: { lat: 18.620029, lng: 73.747434 },
    categories: [SafetyCategory.ACTIVE_PRESENCE, SafetyCategory.COMFORTABLE],
    lastUpdate: 'Just now',
    description: 'Your current demo center. Excellent lighting and clear sightlines.'
  }
];

export const MOCK_CO_TRAVELLERS: CoTraveller[] = [
  {
    id: 'ct1',
    name: 'Priya S.',
    matchScore: 95,
    destination: 'Chinchwad Station',
    timeWindow: 'Leaving in 10 mins',
    verified: true,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya'
  },
  {
    id: 'ct2',
    name: 'Anjali R.',
    matchScore: 88,
    destination: 'Nigdi Pradhikaran',
    timeWindow: 'Leaving now',
    verified: true,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Anjali'
  },
  {
    id: 'ct3',
    name: 'Meera K.',
    matchScore: 82,
    destination: 'Pimpri Market',
    timeWindow: 'Waiting for cab',
    verified: false,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Meera'
  }
];

export const SAFETY_TIPS = [
  "The Community General Store nearby has high PSI and is a verified safe spot.",
  "Rickshaw cluster at the southern corner provides quick transport access.",
  "Share your live location via the SOS tab if entering lower PSI zones.",
  "The Pharmacy on the western street is a reliable hub for assistance."
];
