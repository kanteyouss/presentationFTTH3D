export const COLORS = {
    BACKGROUND: '#1a1a2e',
    GRID: '#2d3436',
    TRANSPORT: '#00d2ff',
    DISTRIBUTION: '#ff9f43',
    HUB: '#00cec9',
    CABINET: '#fab1a0',
    BOX: '#ff7675',
    ROAD: '#2d3436',
    BUILDING: '#bdc3c7',
    ELIGIBLE: '#2ed573',
    NON_ELIGIBLE: '#ff4757',
    TEXT_PRIMARY: '#ffffff',
    TEXT_SECONDARY: '#b2bec3',
    ACCENT: '#0984e3'
};

export const STAGES = [
    {
        id: 0,
        name: 'Analyse SIG',
        description: 'Étude de la densité de population et du potentiel économique du quartier.'
    },
    {
        id: 1,
        name: 'Décision Opérateur',
        description: 'Définition de l\'architecture cible suite aux analyses SIG.'
    },
    {
        id: 2,
        name: 'NRO — Nœud de Raccordement Optique',
        description: 'Implantation du Nœud de Raccordement Optique, cœur du réseau FTTH.'
    },
    {
        id: 3,
        name: 'Transport — Câbles et génie civil',
        description: 'Déploiement des câbles de transport et des fourreaux le long des axes principaux.'
    },
    {
        id: 4,
        name: 'SRO — Sous-Répartiteur Optique',
        description: 'Installation des Sous-Répartiteurs Optiques pour la couverture locale des quartiers.'
    },
    {
        id: 5,
        name: 'Distribution — Câblage SRO vers PBO',
        description: 'Déploiement des câbles de distribution entre les SRO et les Points de Branchement Optique.'
    },
    {
        id: 6,
        name: 'PBO — Point de Branchement Optique',
        description: 'Installation des Points de Branchement Optique et diagnostic d\'éligibilité des bâtiments.'
    },
    {
        id: 7,
        name: 'Diagnostic — Bâtiment Non Raccordable',
        description: 'Bâtiment hors couverture capillaire : absence de PBO à proximité. Analyse des causes et solutions.'
    }
];

export const EQUIPMENT_DATA = {
    NRO: {
        type: 'Nœud de Raccordement Optique',
        range: '20 km',
        capacity: 'Jusqu\'à 10 000 foyers',
        zone: 'ZMD / ZTD',
        description: 'Point central du réseau FTTH. Héberge les équipements actifs de collecte.'
    },
    SRO: {
        type: 'Sous-Répartiteur Optique',
        range: '5 km',
        capacity: '500–1 000 foyers',
        zone: 'ZMD',
        description: 'Nœud de distribution secondaire. Mutualise la fibre entre le NRO et les PBO.'
    },
    PBO: {
        type: 'Point de Branchement Optique',
        range: '300 m',
        capacity: '10–20 foyers',
        zone: 'ZMD / ZTD',
        description: 'Dernier point de mutualisation avant le domicile. Point de raccordement des abonnés.'
    }
};

export const ROAD_SEGMENTS = [
    { from: { x: -75, z: 0 }, to: { x: 75, z: 10 } },
    { from: { x: 0, z: -75 }, to: { x: -10, z: 75 } },
    { from: { x: -40, z: -75 }, to: { x: -30, z: 75 } },
    { from: { x: 40, z: -75 }, to: { x: 50, z: 75 } },
    { from: { x: -75, z: 30 }, to: { x: 75, z: 40 } },
    { from: { x: -75, z: -30 }, to: { x: 75, z: -40 } }
];

export const NETWORK_CONFIG = {
    GROUND_SIZE: 200,
    TRANSPORT_RADIUS: 0.25,
    DISTRIBUTION_RADIUS: 0.12,
    DUCT_RADIUS: 0.42,
    DUCT_CAPACITY: 4,
    CHAMBER_CAPACITY: 6,
    BUNDLE_GROWTH: 0.14,
    SRO_COVERAGE_RADIUS: 50,
    PBO_ELIGIBILITY_RADIUS: 300,
    PBO_HOMES_TARGET: 10,
    NRO_POS: { x: -68, y: 0, z: -58 },
    SRO_POSITIONS: [
        { id: 'SRO-A', x: -10, z: -10, subscribers: 450, type: 'ZMD' },
        { id: 'SRO-B', x: 30, z: -40, subscribers: 280, type: 'ZMD' },
        { id: 'SRO-C', x: -30, z: 35, subscribers: 520, type: 'ZTD' },
        { id: 'SRO-D', x: 55, z: 45, subscribers: 350, type: 'ZMD' }
    ]
};
