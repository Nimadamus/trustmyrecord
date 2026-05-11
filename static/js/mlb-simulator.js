(function () {
    'use strict';

    var UI_BUILD = 'mlb-roster-source-guard-20260511';
    if (typeof console !== 'undefined' && console.info) console.info('MLB Simulator UI build: ' + UI_BUILD);

    var CURRENT_TEAMS = [
        ['current-ari', 'Arizona Diamondbacks', 'ARI', 'NL', 'West', 102, 99, 98, 98, 1.03],
        ['current-atl', 'Atlanta Braves', 'ATL', 'NL', 'East', 108, 103, 104, 101, 1.05],
        ['current-bal', 'Baltimore Orioles', 'BAL', 'AL', 'East', 106, 101, 100, 100, 1.04],
        ['current-bos', 'Boston Red Sox', 'BOS', 'AL', 'East', 101, 97, 96, 97, 1.06],
        ['current-chc', 'Chicago Cubs', 'CHC', 'NL', 'Central', 101, 100, 99, 100, 1.01],
        ['current-cws', 'Chicago White Sox', 'CWS', 'AL', 'Central', 90, 88, 89, 88, 1.08],
        ['current-cin', 'Cincinnati Reds', 'CIN', 'NL', 'Central', 100, 96, 96, 97, 1.07],
        ['current-cle', 'Cleveland Guardians', 'CLE', 'AL', 'Central', 99, 104, 102, 106, 0.96],
        ['current-col', 'Colorado Rockies', 'COL', 'NL', 'West', 94, 87, 87, 89, 1.14],
        ['current-det', 'Detroit Tigers', 'DET', 'AL', 'Central', 99, 102, 103, 100, 0.99],
        ['current-hou', 'Houston Astros', 'HOU', 'AL', 'West', 104, 101, 100, 101, 1.01],
        ['current-kc', 'Kansas City Royals', 'KC', 'AL', 'Central', 100, 103, 103, 100, 0.98],
        ['current-laa', 'Los Angeles Angels', 'LAA', 'AL', 'West', 96, 92, 92, 92, 1.07],
        ['current-lad', 'Los Angeles Dodgers', 'LAD', 'NL', 'West', 114, 107, 106, 105, 1.03],
        ['current-mia', 'Miami Marlins', 'MIA', 'NL', 'East', 89, 90, 91, 90, 1.05],
        ['current-mil', 'Milwaukee Brewers', 'MIL', 'NL', 'Central', 101, 104, 102, 105, 0.97],
        ['current-min', 'Minnesota Twins', 'MIN', 'AL', 'Central', 101, 100, 100, 100, 1.02],
        ['current-nym', 'New York Mets', 'NYM', 'NL', 'East', 103, 100, 99, 101, 1.03],
        ['current-nyy', 'New York Yankees', 'NYY', 'AL', 'East', 109, 104, 103, 104, 1.02],
        ['current-ath', 'Athletics', 'ATH', 'AL', 'West', 94, 91, 91, 91, 1.08],
        ['current-phi', 'Philadelphia Phillies', 'PHI', 'NL', 'East', 107, 105, 106, 102, 1.01],
        ['current-pit', 'Pittsburgh Pirates', 'PIT', 'NL', 'Central', 94, 97, 99, 95, 1.04],
        ['current-sd', 'San Diego Padres', 'SD', 'NL', 'West', 103, 101, 101, 100, 1.02],
        ['current-sf', 'San Francisco Giants', 'SF', 'NL', 'West', 98, 99, 99, 99, 1.00],
        ['current-sea', 'Seattle Mariners', 'SEA', 'AL', 'West', 98, 106, 107, 103, 0.98],
        ['current-stl', 'St. Louis Cardinals', 'STL', 'NL', 'Central', 99, 98, 97, 99, 1.01],
        ['current-tb', 'Tampa Bay Rays', 'TB', 'AL', 'East', 100, 102, 101, 103, 0.98],
        ['current-tex', 'Texas Rangers', 'TEX', 'AL', 'West', 104, 98, 97, 98, 1.06],
        ['current-tor', 'Toronto Blue Jays', 'TOR', 'AL', 'East', 101, 101, 101, 100, 1.00],
        ['current-wsh', 'Washington Nationals', 'WSH', 'NL', 'East', 93, 92, 92, 92, 1.06]
    ];

    var HISTORICAL_TEAMS = [
        ['classic-1927-nyy', '1927 New York Yankees', 'NYY', 1927, 124, 112, 110, 101, 1.08],
        ['classic-1939-nyy', '1939 New York Yankees', 'NYY', 1939, 121, 118, 114, 106, 1.00],
        ['classic-1955-bkn', '1955 Brooklyn Dodgers', 'BKN', 1955, 113, 105, 103, 104, 1.04],
        ['classic-1961-nyy', '1961 New York Yankees', 'NYY', 1961, 118, 109, 107, 104, 1.07],
        ['classic-1969-nym', '1969 New York Mets', 'NYM', 1969, 100, 114, 116, 107, 0.94],
        ['classic-1975-cin', '1975 Cincinnati Reds', 'CIN', 1975, 115, 106, 103, 105, 0.98],
        ['classic-1984-det', '1984 Detroit Tigers', 'DET', 1984, 112, 111, 108, 110, 0.97],
        ['classic-1986-nym', '1986 New York Mets', 'NYM', 1986, 110, 112, 111, 106, 0.97],
        ['classic-1988-lad', '1988 Los Angeles Dodgers', 'LAD', 1988, 99, 112, 113, 108, 0.95],
        ['classic-1995-atl', '1995 Atlanta Braves', 'ATL', 1995, 104, 116, 119, 107, 0.93],
        ['classic-1998-nyy', '1998 New York Yankees', 'NYY', 1998, 113, 113, 110, 111, 0.95],
        ['classic-2001-sea', '2001 Seattle Mariners', 'SEA', 2001, 112, 110, 106, 111, 0.96],
        ['classic-2004-bos', '2004 Boston Red Sox', 'BOS', 2004, 114, 104, 103, 106, 1.04],
        ['classic-2016-chc', '2016 Chicago Cubs', 'CHC', 2016, 108, 114, 113, 108, 0.96],
        ['classic-2017-hou', '2017 Houston Astros', 'HOU', 2017, 116, 108, 107, 106, 1.02],
        ['classic-2019-wsh', '2019 Washington Nationals', 'WSH', 2019, 108, 105, 109, 100, 1.05],
        ['classic-2020-lad', '2020 Los Angeles Dodgers', 'LAD', 2020, 116, 112, 110, 110, 0.98],
        ['classic-2021-atl', '2021 Atlanta Braves', 'ATL', 2021, 106, 103, 104, 104, 1.04],
        ['classic-2022-hou', '2022 Houston Astros', 'HOU', 2022, 109, 114, 113, 112, 0.95],
        ['classic-2023-tex', '2023 Texas Rangers', 'TEX', 2023, 115, 101, 102, 99, 1.08]
    ];

    var CURRENT_PITCHERS = {
        ARI: [['gallen', 'Zac Gallen', 112, 3.45], ['rodriguez', 'Eduardo Rodriguez', 102, 4.05], ['soroka', 'Michael Soroka', 100, 4.15], ['kelly', 'Merrill Kelly', 106, 3.75], ['nelson', 'Ryne Nelson', 100, 4.15]],
        ATL: [['sale', 'Chris Sale', 116, 3.25], ['strider', 'Spencer Strider', 115, 3.30], ['elder', 'Bryce Elder', 101, 4.10], ['holmes', 'Grant Holmes', 98, 4.30], ['ritchie', 'JR Ritchie', 96, 4.45]],
        BAL: [['rogers', 'Trevor Rogers', 102, 4.05], ['bradish', 'Kyle Bradish', 108, 3.70], ['baz', 'Shane Baz', 106, 3.80], ['bassitt', 'Chris Bassitt', 104, 3.95], ['kremer', 'Dean Kremer', 100, 4.20]],
        BOS: [['crochet', 'Garrett Crochet', 114, 3.35], ['gray', 'Sonny Gray', 109, 3.60], ['suarez', 'Ranger Suarez', 108, 3.65], ['early', 'Connelly Early', 95, 4.50], ['bello', 'Brayan Bello', 102, 4.05]],
        CHC: [['imanaga', 'Shota Imanaga', 110, 3.55], ['cabrera', 'Edward Cabrera', 102, 4.05], ['taillon', 'Jameson Taillon', 100, 4.20], ['rea', 'Colin Rea', 97, 4.35], ['wicks', 'Jordan Wicks', 96, 4.45]],
        CWS: [['burke', 'Sean Burke', 96, 4.45], ['fedde', 'Erick Fedde', 101, 4.10], ['kay', 'Anthony Kay', 92, 4.75], ['martin', 'Davis Martin', 94, 4.60], ['schultz', 'Noah Schultz', 98, 4.30]],
        CIN: [['lodolo', 'Nick Lodolo', 106, 3.80], ['abbott', 'Andrew Abbott', 103, 4.00], ['singer', 'Brady Singer', 100, 4.20], ['burns', 'Chase Burns', 101, 4.10], ['lowder', 'Rhett Lowder', 98, 4.30]],
        CLE: [['bibee', 'Tanner Bibee', 108, 3.65], ['cantillo', 'Joey Cantillo', 96, 4.45], ['cecconi', 'Slade Cecconi', 95, 4.50], ['messick', 'Parker Messick', 97, 4.35], ['williams', 'Gavin Williams', 104, 3.95]],
        COL: [['freeland', 'Kyle Freeland', 96, 4.45], ['lorenzen', 'Michael Lorenzen', 97, 4.35], ['quintana', 'Jose Quintana', 98, 4.30], ['sugano', 'Tomoyuki Sugano', 100, 4.20], ['feltner', 'Ryan Feltner', 96, 4.45]],
        DET: [['skubal', 'Tarik Skubal', 118, 3.15], ['valdez', 'Framber Valdez', 112, 3.45], ['flaherty', 'Jack Flaherty', 108, 3.65], ['mize', 'Casey Mize', 101, 4.10], ['verlander', 'Justin Verlander', 104, 3.95]],
        HOU: [['brown', 'Hunter Brown', 110, 3.55], ['imai', 'Tatsuya Imai', 104, 3.95], ['burrows', 'Mike Burrows', 94, 4.60], ['javier', 'Cristian Javier', 106, 3.80], ['mccullers', 'Lance McCullers Jr.', 102, 4.05]],
        KC: [['bubic', 'Kris Bubic', 101, 4.10], ['cameron', 'Noah Cameron', 97, 4.35], ['lugo', 'Seth Lugo', 109, 3.60], ['ragans', 'Cole Ragans', 113, 3.40], ['wacha', 'Michael Wacha', 103, 4.00]],
        LAA: [['soriano', 'Jose Soriano', 101, 4.10], ['detmers', 'Reid Detmers', 100, 4.20], ['grayson-rodriguez', 'Grayson Rodriguez', 106, 3.80], ['kochanowicz', 'Jack Kochanowicz', 96, 4.45], ['ryan-johnson', 'Ryan Johnson', 94, 4.60]],
        LAD: [['yamamoto', 'Yoshinobu Yamamoto', 114, 3.35], ['ohtani', 'Shohei Ohtani', 116, 3.25], ['snell', 'Blake Snell', 112, 3.45], ['glasnow', 'Tyler Glasnow', 113, 3.40], ['sheehan', 'Emmet Sheehan', 101, 4.10]],
        MIA: [['alcantara', 'Sandy Alcantara', 110, 3.55], ['perez', 'Eury Perez', 107, 3.70], ['meyer', 'Max Meyer', 101, 4.10], ['junk', 'Janson Junk', 94, 4.60], ['snelling', 'Robby Snelling', 98, 4.30]],
        MIL: [['misiorowski', 'Jacob Misiorowski', 104, 3.95], ['woodruff', 'Brandon Woodruff', 108, 3.65], ['harrison', 'Kyle Harrison', 99, 4.25], ['priester', 'Quinn Priester', 98, 4.30], ['patrick', 'Chad Patrick', 96, 4.45]],
        MIN: [['ryan', 'Joe Ryan', 108, 3.65], ['ober', 'Bailey Ober', 105, 3.90], ['bradley', 'Taj Bradley', 101, 4.10], ['woods-richardson', 'Simeon Woods Richardson', 99, 4.25], ['abel', 'Mick Abel', 97, 4.35]],
        NYM: [['peralta', 'Freddy Peralta', 109, 3.60], ['mclean', 'Nolan McLean', 98, 4.30], ['holmes', 'Clay Holmes', 101, 4.10], ['peterson', 'David Peterson', 103, 4.00], ['senga', 'Kodai Senga', 108, 3.65]],
        NYY: [['fried', 'Max Fried', 114, 3.35], ['cole', 'Gerrit Cole', 113, 3.40], ['rodon', 'Carlos Rodon', 107, 3.70], ['schlittler', 'Cam Schlittler', 96, 4.45], ['weathers', 'Ryan Weathers', 99, 4.25]],
        ATH: [['civale', 'Aaron Civale', 100, 4.20], ['ginn', 'J.T. Ginn', 95, 4.50], ['lopez', 'Jacob Lopez', 97, 4.35], ['severino', 'Luis Severino', 103, 4.00], ['springs', 'Jeffrey Springs', 104, 3.95]],
        PHI: [['luzardo', 'Jesus Luzardo', 107, 3.70], ['nola', 'Aaron Nola', 110, 3.55], ['painter', 'Andrew Painter', 103, 4.00], ['sanchez', 'Cristopher Sanchez', 109, 3.60], ['wheeler', 'Zack Wheeler', 116, 3.25]],
        PIT: [['skenes', 'Paul Skenes', 118, 3.15], ['keller', 'Mitch Keller', 102, 4.05], ['jones', 'Jared Jones', 104, 3.95], ['ashcraft', 'Braxton Ashcraft', 96, 4.45], ['chandler', 'Bubba Chandler', 99, 4.25]],
        SD: [['pivetta', 'Nick Pivetta', 104, 3.95], ['king', 'Michael King', 110, 3.55], ['musgrove', 'Joe Musgrove', 106, 3.80], ['vasquez', 'Randy Vasquez', 95, 4.50], ['giolito', 'Lucas Giolito', 100, 4.20]],
        SF: [['webb', 'Logan Webb', 113, 3.40], ['ray', 'Robbie Ray', 104, 3.95], ['roupp', 'Landen Roupp', 96, 4.45], ['mahle', 'Tyler Mahle', 102, 4.05], ['houser', 'Adrian Houser', 98, 4.30]],
        SEA: [['gilbert', 'Logan Gilbert', 111, 3.50], ['kirby', 'George Kirby', 112, 3.45], ['woo', 'Bryan Woo', 108, 3.65], ['castillo', 'Luis Castillo', 110, 3.55], ['miller', 'Bryce Miller', 106, 3.80]],
        STL: [['leahy', 'Kyle Leahy', 94, 4.60], ['liberatore', 'Matthew Liberatore', 98, 4.30], ['may', 'Dustin May', 103, 4.00], ['mcgreevy', 'Michael McGreevy', 96, 4.45], ['pallante', 'Andre Pallante', 97, 4.35]],
        TB: [['rasmussen', 'Drew Rasmussen', 108, 3.65], ['mcclanahan', 'Shane McClanahan', 114, 3.35], ['matz', 'Steven Matz', 98, 4.30], ['martinez', 'Nick Martinez', 101, 4.10], ['boyle', 'Joe Boyle', 96, 4.45]],
        TEX: [['degrom', 'Jacob deGrom', 118, 3.15], ['eovaldi', 'Nathan Eovaldi', 106, 3.80], ['gore', 'MacKenzie Gore', 105, 3.90], ['leiter', 'Jack Leiter', 98, 4.30], ['rocker', 'Kumar Rocker', 99, 4.25]],
        TOR: [['gausman', 'Kevin Gausman', 109, 3.60], ['cease', 'Dylan Cease', 110, 3.55], ['bieber', 'Shane Bieber', 108, 3.65], ['yesavage', 'Trey Yesavage', 98, 4.30], ['scherzer', 'Max Scherzer', 105, 3.90]],
        WSH: [['cavalli', 'Cade Cavalli', 97, 4.35], ['griffin', 'Foster Griffin', 94, 4.60], ['irvin', 'Jake Irvin', 100, 4.20], ['littell', 'Zack Littell', 98, 4.30], ['mikolas', 'Miles Mikolas', 99, 4.25]]
    };

    var HISTORICAL_PITCHERS = {
        'classic-1927-nyy': [['hoyt', 'Waite Hoyt', 116, 2.63], ['pennock', 'Herb Pennock', 112, 3.00], ['ruether', 'Dutch Ruether', 101, 3.38], ['pipgras', 'George Pipgras', 104, 4.11], ['shocker', 'Urban Shocker', 110, 2.84]],
        'classic-1939-nyy': [['ruffing', 'Red Ruffing', 118, 2.93], ['gomez', 'Lefty Gomez', 110, 3.41], ['russo', 'Marius Russo', 104, 2.41], ['hadley', 'Bump Hadley', 101, 4.26], ['donald', 'Atley Donald', 106, 3.71]],
        'classic-1955-bkn': [['newcombe', 'Don Newcombe', 116, 3.20], ['podres', 'Johnny Podres', 106, 3.95], ['craig', 'Roger Craig', 99, 4.10], ['loes', 'Billy Loes', 101, 3.50], ['labine', 'Clem Labine', 98, 3.24]],
        'classic-1961-nyy': [['ford', 'Whitey Ford', 121, 3.21], ['terry', 'Ralph Terry', 107, 3.15], ['stafford', 'Bill Stafford', 102, 2.68], ['daley', 'Bud Daley', 100, 3.96], ['sheldon', 'Rollie Sheldon', 99, 3.60]],
        'classic-1969-nym': [['seaver', 'Tom Seaver', 124, 2.21], ['koosman', 'Jerry Koosman', 114, 2.28], ['gentry', 'Gary Gentry', 106, 3.43], ['cardwell', 'Don Cardwell', 99, 3.01], ['mcandrew', 'Jim McAndrew', 97, 3.47]],
        'classic-1975-cin': [['nolan', 'Gary Nolan', 108, 3.16], ['gullett', 'Don Gullett', 106, 2.42], ['billingham', 'Jack Billingham', 99, 4.11], ['darcy', 'Pat Darcy', 95, 3.58], ['kirby', 'Clay Kirby', 94, 4.72]],
        'classic-1984-det': [['morris', 'Jack Morris', 113, 3.60], ['petry', 'Dan Petry', 107, 3.24], ['wilcox', 'Milt Wilcox', 101, 4.00], ['berenguer', 'Juan Berenguer', 96, 3.48], ['rozema', 'Dave Rozema', 94, 3.74]],
        'classic-1986-nym': [['gooden', 'Dwight Gooden', 121, 2.84], ['darling', 'Ron Darling', 109, 2.81], ['fernandez', 'Sid Fernandez', 108, 3.52], ['ojeda', 'Bob Ojeda', 110, 2.57], ['aguilera', 'Rick Aguilera', 99, 3.88]],
        'classic-1988-lad': [['hershiser', 'Orel Hershiser', 125, 2.26], ['leary', 'Tim Leary', 105, 2.91], ['belcher', 'Tim Belcher', 103, 2.91], ['welch', 'Bob Welch', 102, 3.64], ['hillegas', 'Shawn Hillegas', 96, 3.82]],
        'classic-1995-atl': [['maddux', 'Greg Maddux', 130, 1.63], ['glavine', 'Tom Glavine', 116, 3.08], ['smoltz', 'John Smoltz', 112, 3.18], ['avery', 'Steve Avery', 104, 4.67], ['mercker', 'Kent Mercker', 101, 4.15]],
        'classic-1998-nyy': [['cone', 'David Cone', 117, 3.55], ['pettitte', 'Andy Pettitte', 111, 4.24], ['wells', 'David Wells', 115, 3.49], ['hernandez', 'Orlando Hernandez', 108, 3.13], ['irabu', 'Hideki Irabu', 100, 4.06]],
        'classic-2001-sea': [['garcia', 'Freddy Garcia', 116, 3.05], ['moyer', 'Jamie Moyer', 109, 3.43], ['sele', 'Aaron Sele', 103, 3.60], ['abbott', 'Paul Abbott', 99, 4.25], ['halama', 'John Halama', 94, 4.73]],
        'classic-2004-bos': [['schilling', 'Curt Schilling', 122, 3.26], ['martinez', 'Pedro Martinez', 118, 3.90], ['wakefield', 'Tim Wakefield', 99, 4.87], ['lowe', 'Derek Lowe', 98, 5.42], ['arroyo', 'Bronson Arroyo', 101, 4.03]],
        'classic-2016-chc': [['arrieta', 'Jake Arrieta', 115, 3.10], ['hendricks', 'Kyle Hendricks', 120, 2.13], ['lester', 'Jon Lester', 116, 2.44], ['lackey', 'John Lackey', 103, 3.35], ['hammel', 'Jason Hammel', 100, 3.83]],
        'classic-2017-hou': [['keuchel', 'Dallas Keuchel', 114, 2.90], ['verlander', 'Justin Verlander', 118, 1.06], ['mccullers', 'Lance McCullers Jr.', 105, 4.25], ['peacock', 'Brad Peacock', 103, 3.00], ['morton', 'Charlie Morton', 106, 3.62]],
        'classic-2019-wsh': [['scherzer', 'Max Scherzer', 122, 2.92], ['strasburg', 'Stephen Strasburg', 118, 3.32], ['corbin', 'Patrick Corbin', 108, 3.25], ['sanchez', 'Anibal Sanchez', 101, 3.85], ['ross', 'Joe Ross', 94, 5.48]],
        'classic-2020-lad': [['kershaw', 'Clayton Kershaw', 118, 2.16], ['buehler', 'Walker Buehler', 113, 3.44], ['urias', 'Julio Urias', 107, 3.27], ['may', 'Dustin May', 104, 2.57], ['gonsolin', 'Tony Gonsolin', 106, 2.31]],
        'classic-2021-atl': [['fried', 'Max Fried', 115, 3.04], ['morton', 'Charlie Morton', 109, 3.34], ['anderson', 'Ian Anderson', 103, 3.58], ['smyly', 'Drew Smyly', 96, 4.48], ['ynoa', 'Huascar Ynoa', 98, 4.05]],
        'classic-2022-hou': [['verlander', 'Justin Verlander', 124, 1.75], ['valdez', 'Framber Valdez', 115, 2.82], ['javier', 'Cristian Javier', 111, 2.54], ['garcia', 'Luis Garcia', 104, 3.72], ['urquidy', 'Jose Urquidy', 101, 3.94]],
        'classic-2023-tex': [['eovaldi', 'Nathan Eovaldi', 111, 3.63], ['montgomery', 'Jordan Montgomery', 110, 2.79], ['gray', 'Jon Gray', 101, 4.12], ['heaney', 'Andrew Heaney', 98, 4.15], ['dunning', 'Dane Dunning', 102, 3.70]]
    };

    function makeCurrent(row) {
        return {
            id: row[0], era: 'current', name: row[1], abbreviation: row[2], league: row[3], division: row[4],
            offense: row[5], runPrevention: row[6], startingPitching: row[7], bullpen: row[8], volatility: row[9]
        };
    }

    function makeHistorical(row) {
        return {
            id: row[0], era: 'historical', name: row[1], abbreviation: row[2], season: row[3], league: 'Classic', division: 'Curated',
            offense: row[4], runPrevention: row[5], startingPitching: row[6], bullpen: row[7], volatility: row[8]
        };
    }

    var LOCAL_TEAMS = {
        current: CURRENT_TEAMS.map(makeCurrent),
        historical: HISTORICAL_TEAMS.map(makeHistorical)
    };

    var ESPN_TEAM_LOGO_SLUGS = {
        ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CWS: 'chw', CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det',
        HOU: 'hou', KC: 'kc', LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', ATH: 'oak',
        PHI: 'phi', PIT: 'pit', SD: 'sd', SF: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TEX: 'tex', TOR: 'tor', WSH: 'wsh'
    };

    var ESPN_ROSTER_SLUGS = {
        ARI: 'ari', ATL: 'atl', BAL: 'bal', BOS: 'bos', CHC: 'chc', CWS: 'chw', CIN: 'cin', CLE: 'cle', COL: 'col', DET: 'det',
        HOU: 'hou', KC: 'kc', LAA: 'laa', LAD: 'lad', MIA: 'mia', MIL: 'mil', MIN: 'min', NYM: 'nym', NYY: 'nyy', ATH: 'ath',
        PHI: 'phi', PIT: 'pit', SD: 'sd', SF: 'sf', SEA: 'sea', STL: 'stl', TB: 'tb', TEX: 'tex', TOR: 'tor', WSH: 'wsh'
    };

    var MLB_TEAM_IDS = {
        ARI: 109, ATL: 144, BAL: 110, BOS: 111, CHC: 112, CWS: 145, CIN: 113, CLE: 114, COL: 115, DET: 116,
        HOU: 117, KC: 118, LAA: 108, LAD: 119, MIA: 146, MIL: 158, MIN: 142, NYM: 121, NYY: 147, ATH: 133,
        PHI: 143, PIT: 134, SD: 135, SF: 137, SEA: 136, STL: 138, TB: 139, TEX: 140, TOR: 141, WSH: 120
    };

    var REPORTED_MISMATCHED_CURRENT_NAMES = {
        ARI: { nolanarenado: true }
    };
    var MIN_CURRENT_ROSTER_BATTERS = 9;
    var MIN_CURRENT_ROSTER_PITCHERS = 5;

    var TEAM_COLORS = {
        ARI: ['#a71930', '#e3d4ad'], ATL: ['#ce1141', '#13274f'], BAL: ['#df4601', '#000000'], BOS: ['#bd3039', '#0c2340'],
        CHC: ['#0e3386', '#cc3433'], CWS: ['#c4ced4', '#27251f'], CIN: ['#c6011f', '#ffffff'], CLE: ['#e31937', '#0c2340'],
        COL: ['#33006f', '#c4ced4'], DET: ['#0c2340', '#fa4616'], HOU: ['#eb6e1f', '#002d62'], KC: ['#004687', '#bd9b60'],
        LAA: ['#ba0021', '#003263'], LAD: ['#005a9c', '#ffffff'], MIA: ['#00a3e0', '#ef3340'], MIL: ['#ffc52f', '#12284b'],
        MIN: ['#002b5c', '#d31145'], NYM: ['#ff5910', '#002d72'], NYY: ['#0c2340', '#c4ced4'], ATH: ['#003831', '#efb21e'],
        PHI: ['#e81828', '#002d72'], PIT: ['#fdb827', '#27251f'], SD: ['#2f241d', '#ffc425'], SF: ['#fd5a1e', '#27251f'],
        SEA: ['#0c2c56', '#005c5c'], STL: ['#c41e3a', '#0c2340'], TB: ['#092c5c', '#8fbce6'], TEX: ['#003278', '#c0111f'],
        TOR: ['#134a8e', '#1d2d5c'], WSH: ['#ab0003', '#14225a'], BKN: ['#003087', '#ffffff']
    };

    var LIVE_INPUT_SOURCES = [
        ['scheduleFinals', 'MLB schedule/finals', 'Unavailable', 'No verified current schedule or final score match is connected.'],
        ['teamRecords', 'Team records', 'Unavailable', 'No verified team record match is connected.'],
        ['startingPitchers', 'Probable starters', 'Unavailable', 'No probable starter feed is connected.'],
        ['confirmedStarters', 'Confirmed starter status', 'Unavailable', 'No confirmed-starter status feed is connected.'],
        ['ballpark', 'Ballpark', 'Unavailable', 'No verified venue feed is connected.'],
        ['weather', 'Weather', 'Unavailable', 'No verified weather feed is connected.'],
        ['sportsbookOdds', 'Sportsbook odds', 'Unavailable', 'No verified sportsbook source is connected.'],
        ['injuryReport', 'Injury report', 'Unavailable', 'No verified injury report feed is connected.'],
        ['rosterContext', 'Roster context', 'Unavailable', 'No verified player roster feed is connected.'],
        ['recentForm', 'Recent scoring form', 'Unavailable', 'No verified recent final-score feed is connected.'],
        ['bullpenContext', 'Bullpen context', 'Unavailable', 'No verified bullpen availability feed is connected.']
    ].map(function (row) { return { key: row[0], label: row[1], status: row[2], detail: row[3], verified: false }; });

    var state = {
        preset: 'current',
        awayPool: 'current',
        homePool: 'current',
        teams: LOCAL_TEAMS,
        dataMode: 'baseline',
        liveInputs: LIVE_INPUT_SOURCES,
        liveContext: {
            status: 'idle',
            loadedAt: null,
            scheduleGames: [],
            boardGames: [],
            espnEvents: [],
            espnSummaries: {},
            teamRosters: {},
            recentEvents: [],
            error: null
        },
        awayTeamId: LOCAL_TEAMS.current[0].id,
        homeTeamId: LOCAL_TEAMS.current[1].id,
        awayPitcherId: '',
        homePitcherId: '',
        awayPitcherTouched: false,
        homePitcherTouched: false,
        simulation: null,
        aggregate: null,
        simulationCount: 1
    };

    function byId(id) { return document.getElementById(id); }
    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function round1(value) { return Math.round(value * 10) / 10; }
    function roundPct(value) { return (value * 100).toFixed(1).replace(/\.0$/, '') + '%'; }
    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function escapeAttr(value) { return escapeHtml(value); }
    function setText(id, value) { var el = byId(id); if (el) el.textContent = value; }
    function normalizeName(value) { return String(value || '').toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, ''); }
    function seededHash(value) {
        var str = String(value || '');
        var h = 2166136261;
        for (var i = 0; i < str.length; i += 1) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function seededRandom(seed) {
        var t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            var x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }
    function poisson(lambda, random) {
        lambda = clamp(lambda, 0.02, 3.4);
        var limit = Math.exp(-lambda);
        var k = 0;
        var product = 1;
        do {
            k += 1;
            product *= random();
        } while (product > limit && k < 12);
        return k - 1;
    }
    function todayEspnDate() { return new Date().toISOString().slice(0, 10).replace(/-/g, ''); }
    function espnDateOffset(daysBack) {
        var d = new Date();
        d.setDate(d.getDate() - daysBack);
        return d.toISOString().slice(0, 10).replace(/-/g, '');
    }
    function recentEspnDates() {
        var dates = [];
        for (var i = 0; i <= 6; i += 1) dates.push(espnDateOffset(i));
        return dates;
    }
    function apiBaseUrl() {
        if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG.api && CONFIG.api.baseUrl) return CONFIG.api.baseUrl;
        return 'https://trustmyrecord-api.onrender.com/api';
    }
    function fetchJson(url, options) {
        if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
        options = options || {};
        return fetch(url, { headers: { 'Accept': 'application/json' }, cache: options.cache || 'default' }).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        });
    }

    function playerPositionLabel(player) {
        return String(player && player.position || '').toUpperCase();
    }
    function rosterSortValue(player) {
        var position = playerPositionLabel(player);
        var order = { CF: 1, SS: 2, RF: 3, '1B': 4, '3B': 5, LF: 6, DH: 7, '2B': 8, C: 9, OF: 10, IF: 11 };
        return order[position] || 20;
    }
    function playerBlockedForTeam(team, name) {
        var blocked = team && REPORTED_MISMATCHED_CURRENT_NAMES[team.abbreviation];
        return !!(blocked && blocked[normalizeName(name)]);
    }
    function playerBelongsToTeam(player, team) {
        if (!team || team.era !== 'current' || !player) return !!player;
        var expectedId = MLB_TEAM_IDS[team.abbreviation];
        if (!expectedId) return false;
        if (playerBlockedForTeam(team, player.name)) return false;
        return String(player.teamId || '') === String(expectedId);
    }
    function validatedRosterForTeam(team, roster) {
        if (!roster || !Array.isArray(roster.players)) return null;
        if (team && team.era === 'current' && String(roster.teamId || '') !== String(MLB_TEAM_IDS[team.abbreviation] || '')) return null;
        var players = roster.players.filter(function (player) { return playerBelongsToTeam(player, team); });
        if (!players.length) return null;
        var pitchers = players.filter(function (player) { return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); });
        var hitters = players.filter(function (player) { return !/^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); });
        if (team && team.era === 'current' && (hitters.length < MIN_CURRENT_ROSTER_BATTERS || pitchers.length < MIN_CURRENT_ROSTER_PITCHERS)) return null;
        return Object.assign({}, roster, {
            count: players.length,
            relievers: pitchers.length,
            players: players,
            summary: players.length + ' verified active roster players'
        });
    }
    function collectEspnTeamRoster(data, team) {
        var players = [];
        var groups = Array.isArray(data && data.athletes) ? data.athletes : [];
        groups.forEach(function (group) {
            var groupPosition = group && (group.position || group.displayName || group.name) || '';
            (group.items || group.athletes || []).forEach(function (item) {
                var name = item && (item.displayName || item.fullName || item.name);
                if (!name) return;
                var position = item.position && (item.position.abbreviation || item.position.displayName || item.position.name) || groupPosition;
                players.push({ name: name, position: position, teamId: String(MLB_TEAM_IDS[team && team.abbreviation] || '') });
            });
        });
        var seen = {};
        players = players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        var hitters = players.filter(function (player) { return !/Pitcher|P$|SP|RP|CP/i.test(player.position); }).sort(function (a, b) { return rosterSortValue(a) - rosterSortValue(b); });
        var pitchers = players.filter(function (player) { return /Pitcher|P$|SP|RP|CP/i.test(player.position); });
        return validatedRosterForTeam(team, {
            teamId: String(MLB_TEAM_IDS[team && team.abbreviation] || ''),
            count: players.length,
            relievers: pitchers.length,
            players: hitters.concat(pitchers),
            summary: players.length + ' ESPN roster players',
            source: 'ESPN roster endpoint'
        });
    }
    function collectMlbTeamRoster(data, team) {
        var expectedId = MLB_TEAM_IDS[team && team.abbreviation];
        var players = [];
        (Array.isArray(data && data.roster) ? data.roster : []).forEach(function (entry) {
            var name = entry && entry.person && entry.person.fullName;
            var position = entry && entry.position && (entry.position.abbreviation || entry.position.name);
            var teamId = entry && (entry.parentTeamId || entry.teamId || expectedId);
            var statusCode = entry && entry.status && entry.status.code;
            if (!name || !position) return;
            if (statusCode && statusCode !== 'A') return;
            players.push({ name: name, position: position, teamId: String(teamId || '') });
        });
        var seen = {};
        players = players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
        var hitters = players.filter(function (player) { return !/Pitcher|P$|SP|RP|CP/i.test(player.position); }).sort(function (a, b) { return rosterSortValue(a) - rosterSortValue(b); });
        var pitchers = players.filter(function (player) { return /Pitcher|P$|SP|RP|CP/i.test(player.position); });
        return validatedRosterForTeam(team, {
            teamId: String(expectedId || ''),
            count: players.length,
            relievers: pitchers.length,
            players: hitters.concat(pitchers),
            summary: players.length + ' MLB active roster players',
            source: 'Projected lineup from verified MLB active roster endpoint'
        });
    }
    function teamRosterUrl(team) {
        var teamId = team && MLB_TEAM_IDS[team.abbreviation];
        return teamId ? 'https://statsapi.mlb.com/api/v1/teams/' + teamId + '/roster?rosterType=active&_=' + encodeURIComponent(UI_BUILD) : '';
    }
    function rosterSourceForTeam(team) {
        return {
            teamId: team && MLB_TEAM_IDS[team.abbreviation] || null,
            url: teamRosterUrl(team),
            source: 'MLB Stats API active roster',
            cache: 'no-store plus UI build cache-buster',
            minimumBatters: MIN_CURRENT_ROSTER_BATTERS,
            minimumPitchers: MIN_CURRENT_ROSTER_PITCHERS
        };
    }
    function fetchTeamRoster(team) {
        if (!team || team.era !== 'current') return Promise.resolve(null);
        state.liveContext.teamRosters = state.liveContext.teamRosters || {};
        if (state.liveContext.teamRosters[team.abbreviation] && state.liveContext.teamRosters[team.abbreviation].uiBuild === UI_BUILD) return Promise.resolve(state.liveContext.teamRosters[team.abbreviation]);
        var url = teamRosterUrl(team);
        if (!url) return Promise.resolve(null);
        return fetchJson(url, { cache: 'no-store' }).then(function (data) {
            var roster = collectMlbTeamRoster(data, team);
            if (roster) roster.uiBuild = UI_BUILD;
            state.liveContext.teamRosters[team.abbreviation] = roster;
            return roster;
        }).catch(function () {
            state.liveContext.teamRosters[team.abbreviation] = null;
            return null;
        });
    }
    function rostersForTeams(away, home, context) {
        var rosters = {};
        if (context && context.extraContext && context.extraContext.rosters) {
            if (away && away.era !== 'current') rosters.away = context.extraContext.rosters.away;
            if (home && home.era !== 'current') rosters.home = context.extraContext.rosters.home;
        }
        rosters.away = validatedRosterForTeam(away, rosters.away);
        rosters.home = validatedRosterForTeam(home, rosters.home);
        state.liveContext.teamRosters = state.liveContext.teamRosters || {};
        if (!rosters.away && away && away.era === 'current') rosters.away = validatedRosterForTeam(away, state.liveContext.teamRosters[away.abbreviation]);
        if (!rosters.home && home && home.era === 'current') rosters.home = validatedRosterForTeam(home, state.liveContext.teamRosters[home.abbreviation]);
        return rosters.away || rosters.home ? rosters : null;
    }
    function ensureRostersForTeams(away, home) {
        return Promise.all([fetchTeamRoster(away), fetchTeamRoster(home)]);
    }

    function poolTeams(pool) { return state.teams[pool] || []; }
    function activeTeams() { return poolTeams(state.awayPool).concat(poolTeams(state.homePool)); }
    function findTeamInPool(id, pool) { return poolTeams(pool).filter(function (team) { return team.id === id; })[0] || null; }
    function findTeam(id) {
        return poolTeams('current').concat(poolTeams('historical')).filter(function (team) { return team.id === id; })[0] || null;
    }
    function eraLabel(team) {
        if (!team) return 'Select team';
        return team.era === 'historical' ? 'Classic ' + team.season : 'Current MLB';
    }
    function teamMeta(team) {
        if (!team) return 'No team selected';
        return team.era === 'historical' ? [team.abbreviation, team.season, 'Historical'].join(' / ') : [team.abbreviation, team.league, team.division].join(' / ');
    }
    function teamColors(team) {
        return team && TEAM_COLORS[team.abbreviation] || ['#2dd4bf', '#60a5fa'];
    }
    function teamLogoUrl(team) {
        if (!team || team.era !== 'current' || !ESPN_TEAM_LOGO_SLUGS[team.abbreviation]) return '';
        return 'https://a.espncdn.com/i/teamlogos/mlb/500/' + ESPN_TEAM_LOGO_SLUGS[team.abbreviation] + '.png';
    }
    function logoMarkup(team, sizeClass) {
        var abbreviation = team ? team.abbreviation : 'MLB';
        var colors = teamColors(team);
        var url = teamLogoUrl(team);
        var fallbackStyle = 'background: linear-gradient(135deg, ' + colors[0] + ', ' + colors[1] + ');';
        var fallback = '<span class="team-logo-fallback" style="' + escapeAttr(fallbackStyle) + '">' + escapeHtml(abbreviation) + '</span>';
        if (!url) return '<span class="team-logo-mark ' + sizeClass + '">' + fallback + '</span>';
        return "<span class=\"team-logo-mark " + sizeClass + "\"><img src=\"" + escapeAttr(url) + "\" alt=\"" + escapeAttr((team ? team.name : 'MLB') + " logo") + "\" loading=\"lazy\" onerror=\"this.style.display='none';this.nextElementSibling.style.display='grid';\"><span class=\"team-logo-fallback image-fallback\" style=\"" + escapeAttr(fallbackStyle) + "\">" + escapeHtml(abbreviation) + "</span></span>";
    }
    function renderTeamIdentity(id, team, label) {
        var el = byId(id);
        if (!el) return;
        if (!team) {
            el.innerHTML = '<div class="team-logo-mark picker-logo"><span class="team-logo-fallback">MLB</span></div><div><strong>' + escapeHtml(label || 'Select team') + '</strong><span>Choose a team to load starters</span></div>';
            return;
        }
        el.innerHTML = logoMarkup(team, 'picker-logo') + '<div><strong>' + escapeHtml(team.name) + '</strong><span>' + escapeHtml(teamMeta(team)) + '</span></div>';
    }
    function setLogo(id, team, sizeClass) {
        var el = byId(id);
        if (el) el.innerHTML = logoMarkup(team, sizeClass || 'small-logo');
    }
    function applyAccent(id, team) {
        var el = byId(id);
        if (!el || !team) return;
        var colors = teamColors(team);
        el.style.setProperty('--team-primary', colors[0]);
        el.style.setProperty('--team-secondary', colors[1]);
    }
    function pitcherId(side, slug) { return side + '-pitcher-' + slug; }
    function slugify(value) { return normalizeName(value).slice(0, 40) || 'starter'; }
    function currentPitchersForTeam(team, side, context) {
        var liveStarter = context && context.espnGame ? (side === 'away' ? context.espnGame.awayStarter : context.espnGame.homeStarter) : null;
        var options = [];
        var verifiedRoster = validatedRosterForTeam(team, state.liveContext.teamRosters && state.liveContext.teamRosters[team.abbreviation]);
        var verifiedPitchers = verifiedRoster ? verifiedRoster.players.filter(function (player) {
            return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || ''));
        }) : [];
        var curatedPitchers = CURRENT_PITCHERS[team.abbreviation] || [];
        function curatedMatch(name) {
            return curatedPitchers.filter(function (row) { return normalizeName(row[1]) === normalizeName(name); })[0] || null;
        }
        if (liveStarter && liveStarter.name && verifiedPitchers.filter(function (player) { return normalizeName(player.name) === normalizeName(liveStarter.name); }).length) {
            options.push({
                id: pitcherId(side, 'live-' + slugify(liveStarter.name)),
                name: liveStarter.name,
                quality: 104 + clamp((4.2 - (Number.isFinite(liveStarter.era) ? liveStarter.era : 4.2)) * 8, -12, 16),
                era: Number.isFinite(liveStarter.era) ? liveStarter.era : null,
                source: 'Verified ESPN probable starter',
                verified: true,
                note: liveStarter.record || 'Listed by ESPN as probable'
            });
        }
        var rosterRows = verifiedPitchers.filter(function (player) {
            return !liveStarter || !liveStarter.name || normalizeName(player.name) !== normalizeName(liveStarter.name);
        }).sort(function (a, b) {
            var aCurated = curatedMatch(a.name);
            var bCurated = curatedMatch(b.name);
            if (aCurated && bCurated) return curatedPitchers.indexOf(aCurated) - curatedPitchers.indexOf(bCurated);
            if (aCurated) return -1;
            if (bCurated) return 1;
            return 0;
        });
        if (!rosterRows.length && !options.length) return [];
        rosterRows.slice(0, liveStarter && liveStarter.name ? 4 : 5).forEach(function (player) {
            var row = curatedMatch(player.name);
            options.push({
                id: pitcherId(side, team.id + '-' + slugify(player.name)),
                name: player.name,
                quality: row ? row[2] : 100,
                era: row ? row[3] : null,
                source: verifiedRoster.source,
                verified: true,
                note: 'Verified on the selected team active roster'
            });
        });
        return options;
    }
    function historicalPitchersForTeam(team, side) {
        var rows = HISTORICAL_PITCHERS[team.id] || [];
        rows = rows.slice();
        return rows.map(function (row) {
            return {
                id: pitcherId(side, team.id + '-' + row[0]),
                name: row[1],
                quality: row[2],
                era: row[3],
                source: 'Historical simulator input',
                verified: false,
                note: 'Curated historical simulator input; not live verified starter data'
            };
        });
    }
    function pitcherOptionsFor(team, side, context) {
        if (!team) return [];
        return team.era === 'historical' ? historicalPitchersForTeam(team, side) : currentPitchersForTeam(team, side, context);
    }
    function selectedPitcher(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var selectedId = side === 'away' ? state.awayPitcherId : state.homePitcherId;
        return options.filter(function (pitcher) { return pitcher.id === selectedId; })[0] || options[0] || null;
    }
    function pitcherMeta(pitcher) {
        if (!pitcher) return 'No pitcher selected.';
        return pitcher.verified ? 'Verified on the selected team active roster.' : 'Starter list is for simulation selection and may not reflect today\'s confirmed starter.';
    }
    function pitcherRecord(pitcher) {
        var match = String(pitcher && pitcher.note ? pitcher.note : '').match(/(\d+\s*-\s*\d+)/);
        return match ? match[1].replace(/\s+/g, '') : 'N/A';
    }
    function pitcherOptionLabel(pitcher) {
        return pitcher.name + ', ERA ' + (pitcher.era != null ? pitcher.era : 'N/A') + ', W-L ' + pitcherRecord(pitcher);
    }
    function pitcherOptionTag(pitcher, selected) {
        return '<option value="' + escapeHtml(pitcher.id) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(pitcherOptionLabel(pitcher)) + '</option>';
    }
    function strength(team) {
        return (team.offense * 0.38) + (team.runPrevention * 0.25) + (team.startingPitching * 0.22) + (team.bullpen * 0.15);
    }
    function edgeLabel(metric, away, home) {
        var gap = away[metric] - home[metric];
        if (Math.abs(gap) < 2.5) return 'Near even';
        return (gap > 0 ? away.name : home.name) + ' +' + Math.abs(Math.round(gap));
    }
    function inningWeights(isHome) {
        return isHome ? [0.108, 0.111, 0.114, 0.113, 0.112, 0.112, 0.112, 0.109, 0.109] : [0.111, 0.112, 0.114, 0.113, 0.112, 0.111, 0.109, 0.109, 0.109];
    }
    function controlledFinalScore(expected, opponentExpected, winShare, random) {
        var base = clamp(expected, 1.4, 8.6);
        var lambda = clamp(base * (0.78 + random() * 0.44), 1.0, 9.6);
        var score = poisson(lambda, random);
        if (random() < 0.18) score += poisson(clamp(base * 0.22, 0.1, 2.1), random);
        if (base >= 5.2 && winShare > 0.62 && random() < 0.14) score += 2 + poisson(0.85, random);
        if (base >= 6.3 && random() < 0.08) score += 1 + poisson(0.65, random);
        if (winShare > 0.58 && random() < 0.22) score += 1;
        if (winShare < 0.38 && random() < 0.16) score = Math.max(0, score - 1);
        var rareOutlier = random() < 0.006 && base >= 5.7;
        var cap = rareOutlier ? 20 : (base >= 6.6 ? 16 : (base <= 3.2 ? 10 : 13));
        if (opponentExpected >= 6.2 && score > 14 && !rareOutlier) cap = Math.min(cap, 14);
        return clamp(score, 0, cap);
    }
    function distributeRuns(total, expected, random, isHome) {
        var weights = inningWeights(isHome);
        var innings = weights.map(function () { return 0; });
        var remaining = total;
        weights.forEach(function (weight, index) {
            if (index === 8) return;
            var lambda = clamp(expected * weight * (0.72 + random() * 0.68), 0.02, 1.85);
            var maxInning = remaining >= 10 ? 6 : 4;
            var runs = Math.min(remaining, Math.min(maxInning, poisson(lambda, random)));
            innings[index] = runs;
            remaining -= runs;
        });
        while (remaining > 0) {
            var idx = Math.floor(random() * 9);
            if (innings[idx] < (remaining > 6 ? 6 : 4)) {
                innings[idx] += 1;
                remaining -= 1;
            }
        }
        return innings;
    }
    function hitTotalForRuns(runs, team, pitcher, random) {
        var offenseLift = clamp((team.offense - 100) * 0.025, -0.7, 0.9);
        var pitcherDrag = pitcher ? clamp((100 - pitcher.quality) * 0.012, -0.35, 0.45) : 0;
        return Math.round(clamp(runs + 4.2 + offenseLift + pitcherDrag + (random() * 3.8), Math.max(runs, 1), 18));
    }
    function errorTotal(team, random) {
        var prevention = clamp((104 - team.runPrevention) * 0.012, -0.25, 0.35);
        var chance = clamp(0.44 + prevention, 0.18, 0.78);
        var errors = random() < chance ? 1 : 0;
        if (random() < 0.06) errors += 1;
        return errors;
    }
    function allocateWhole(total, count, random, minimums) {
        var values = [];
        var remaining = Math.max(0, Math.round(total));
        for (var i = 0; i < count; i += 1) {
            var min = minimums && minimums[i] ? minimums[i] : 0;
            values.push(min);
            remaining -= min;
        }
        remaining = Math.max(0, remaining);
        while (remaining > 0) {
            values[Math.floor(random() * count)] += 1;
            remaining -= 1;
        }
        return values;
    }
    function weightedAllocate(total, weights, random, caps, minimums) {
        var count = weights.length;
        var values = [];
        var remaining = Math.max(0, Math.round(total));
        for (var i = 0; i < count; i += 1) {
            var min = minimums && minimums[i] ? minimums[i] : 0;
            values[i] = min;
            remaining -= min;
        }
        remaining = Math.max(0, remaining);
        var guard = 0;
        while (remaining > 0 && guard < 1000) {
            guard += 1;
            var available = [];
            var totalWeight = 0;
            for (var j = 0; j < count; j += 1) {
                var cap = caps && Number.isFinite(caps[j]) ? caps[j] : 99;
                if (values[j] < cap) {
                    var weight = Math.max(0.01, Number(weights[j] || 1));
                    available.push({ index: j, weight: weight });
                    totalWeight += weight;
                }
            }
            if (!available.length) break;
            var pick = random() * totalWeight;
            for (var k = 0; k < available.length; k += 1) {
                pick -= available[k].weight;
                if (pick <= 0 || k === available.length - 1) {
                    values[available[k].index] += 1;
                    remaining -= 1;
                    break;
                }
            }
        }
        return values;
    }
    function sumAllocated(rows, key) {
        return rows.reduce(function (total, row) { return total + Number(row[key] || 0); }, 0);
    }
    function playerSum(rows, key) {
        return (rows || []).reduce(function (total, row) { return total + Number(row && row[key] || 0); }, 0);
    }
    function allocateExtraBaseHits(hits, runs, random) {
        var total = hits.reduce(function (sum, value) { return sum + value; }, 0);
        var homers = weightedAllocate(clamp(Math.round(runs * 0.28 + total * 0.07 + random()), 0, Math.min(5, total)), hits.map(function (hit) { return hit + 0.2; }), random, hits);
        var remainingAfterHr = hits.map(function (hit, index) { return Math.max(0, hit - homers[index]); });
        var doubles = weightedAllocate(clamp(Math.round(total * 0.2 + random()), 0, Math.min(7, remainingAfterHr.reduce(function (sum, value) { return sum + value; }, 0))), remainingAfterHr.map(function (hit) { return hit + 0.15; }), random, remainingAfterHr);
        var remainingAfterDoubles = remainingAfterHr.map(function (hit, index) { return Math.max(0, hit - doubles[index]); });
        var triples = weightedAllocate(clamp(Math.round((total >= 8 && random() < 0.28 ? 1 : 0) + (random() < 0.08 ? 1 : 0)), 0, Math.min(2, remainingAfterDoubles.reduce(function (sum, value) { return sum + value; }, 0))), remainingAfterDoubles.map(function (hit, index) { return hit + (index < 2 ? 0.35 : 0.05); }), random, remainingAfterDoubles);
        return { doubles: doubles, triples: triples, homers: homers };
    }
    function capBaserunnerOutliers(rows) {
        rows.forEach(function (row) {
            var outs = Number(row.outs || 0);
            var maxNoDamageHits = outs <= 3 ? 2 : (outs <= 6 ? 3 : 5);
            if (!row.r && row.h > maxNoDamageHits) row.r = Math.min(row.h - maxNoDamageHits, 2);
            if (row.er > row.r) row.er = row.r;
        });
    }
    function lineupPositionLabel(position) {
        var value = String(position || '').toUpperCase().replace(/\./g, '').trim();
        if (value === 'OUTFIELD') return 'OF';
        if (value === 'INFIELD') return 'IF';
        if (value === 'DESIGNATED HITTER') return 'DH';
        return value;
    }
    function isPitcherPosition(position) {
        return /^(P|SP|RP|CP|RELIEF|PITCHER)$/i.test(lineupPositionLabel(position));
    }
    function positionFamily(position) {
        var pos = lineupPositionLabel(position);
        if (/^(LF|CF|RF|OF)$/.test(pos)) return 'OF';
        if (/^(1B|2B|3B|SS|IF)$/.test(pos)) return 'IF';
        return pos;
    }
    function stableLineupSeed(player) {
        var text = normalizeName(player && player.name || '');
        var seed = 0;
        for (var index = 0; index < text.length; index += 1) seed = (seed + text.charCodeAt(index) * (index + 3)) % 97;
        return seed;
    }
    function positionFitScore(player, targetPosition) {
        var primary = lineupPositionLabel(player && player.position);
        if (primary === targetPosition) return 100;
        if (targetPosition === 'DH') return primary === 'DH' ? 100 : 38 + stableLineupSeed(player) % 12;
        if (/^(LF|CF|RF)$/.test(targetPosition) && primary === 'OF') return 82;
        if (/^(1B|2B|3B|SS)$/.test(targetPosition) && primary === 'IF') return 74;
        if (positionFamily(primary) === positionFamily(targetPosition) && primary !== 'C') return 48;
        return 0;
    }
    function chooseLineupPlayer(players, used, targetPosition) {
        var best = null;
        var bestScore = -1;
        players.forEach(function (player) {
            var key = normalizeName(player.name);
            if (!key || used[key]) return;
            var score = positionFitScore(player, targetPosition) * 1000 - Number(player.rosterIndex || 0) * 5 + stableLineupSeed(player);
            if (score > bestScore) {
                best = player;
                bestScore = score;
            }
        });
        return best;
    }
    function batterProfile(row) {
        var pos = row.assignedPosition;
        var seed = stableLineupSeed(row.player || row);
        var speed = { CF: 92, SS: 84, RF: 68, LF: 64, '2B': 78, '3B': 56, '1B': 42, DH: 38, C: 30 }[pos] || 55;
        var contact = { CF: 78, SS: 82, RF: 74, LF: 72, '2B': 84, '3B': 72, '1B': 66, DH: 68, C: 58 }[pos] || 66;
        var power = { CF: 58, SS: 62, RF: 86, LF: 78, '2B': 60, '3B': 82, '1B': 88, DH: 90, C: 64 }[pos] || 64;
        return {
            speed: speed + seed % 9,
            contact: contact + seed % 7,
            power: power + seed % 11,
            overall: speed * 0.24 + contact * 0.34 + power * 0.42 + seed % 6
        };
    }
    function lineupSlotScore(row, slotIndex) {
        var profile = batterProfile(row);
        var posPenalty = row.assignedPosition === 'C' && slotIndex < 5 ? 18 : 0;
        var weights = [
            { speed: 0.46, contact: 0.38, power: 0.12, overall: 0.04 },
            { speed: 0.18, contact: 0.48, power: 0.18, overall: 0.16 },
            { speed: 0.08, contact: 0.25, power: 0.35, overall: 0.32 },
            { speed: 0.02, contact: 0.12, power: 0.58, overall: 0.28 },
            { speed: 0.05, contact: 0.18, power: 0.44, overall: 0.33 },
            { speed: 0.12, contact: 0.28, power: 0.28, overall: 0.32 },
            { speed: 0.12, contact: 0.30, power: 0.20, overall: 0.38 },
            { speed: 0.08, contact: 0.28, power: 0.18, overall: 0.46 },
            { speed: 0.34, contact: 0.34, power: 0.10, overall: 0.22 }
        ][slotIndex];
        return profile.speed * weights.speed + profile.contact * weights.contact + profile.power * weights.power + profile.overall * weights.overall - posPenalty;
    }
    function orderProjectedLineup(selected) {
        var remaining = selected.slice();
        var ordered = [];
        for (var slot = 0; slot < 9 && remaining.length; slot += 1) {
            var bestIndex = 0;
            var bestScore = -999;
            remaining.forEach(function (row, index) {
                var score = lineupSlotScore(row, slot);
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                }
            });
            ordered.push(remaining.splice(bestIndex, 1)[0]);
        }
        return ordered;
    }
    function projectedLineupRows(roster, team) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var hitters = players.filter(function (player) { return player && player.name && !isPitcherPosition(player.position); }).map(function (player, index) {
            return Object.assign({ rosterIndex: index }, player);
        });
        var targetPositions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
        var used = {};
        var selected = [];
        targetPositions.forEach(function (position) {
            var player = chooseLineupPlayer(hitters, used, position);
            if (!player) return;
            used[normalizeName(player.name)] = true;
            selected.push({ player: player, assignedPosition: position });
        });
        targetPositions.forEach(function (position) {
            if (selected.some(function (row) { return row.assignedPosition === position; })) return;
            var player = chooseLineupPlayer(hitters, used, 'DH');
            if (player) {
                used[normalizeName(player.name)] = true;
                selected.push({ player: player, assignedPosition: position });
            } else if (roster && players.length) {
                selected.push({ player: { name: (team && team.abbreviation || 'Team') + ' projected ' + position, position: position }, assignedPosition: position, simulatedFallback: true });
            }
        });
        return orderProjectedLineup(selected.slice(0, 9));
    }
    function rosterNamesForBatters(roster, team) {
        return projectedLineupRows(roster, team).map(function (row) {
            return row.player.name + ' (' + row.assignedPosition + ')';
        });
    }
    function rosterNamesForPitchers(roster, starter) {
        var players = Array.isArray(roster && roster.players) ? roster.players : [];
        var names = [];
        if (starter && starter.name) names.push(starter.name);
        players.filter(function (player) { return /^(P|SP|RP|CP)$|Relief|Pitcher/i.test(String(player.position || '')); }).forEach(function (player) {
            if (names.map(normalizeName).indexOf(normalizeName(player.name)) === -1) names.push(player.name);
        });
        return names.slice(0, 3);
    }
    function historicalRosterForTeam(team) {
        var key = team && (team.id || '').replace(/^classic-/, '');
        var batters = {
            '1927-nyy': ['Earle Combs (CF)', 'Mark Koenig (SS)', 'Babe Ruth (RF)', 'Lou Gehrig (1B)', 'Bob Meusel (LF)', 'Tony Lazzeri (2B)', 'Joe Dugan (3B)', 'Pat Collins (C)', 'Benny Bengough (C)'],
            '1939-nyy': ['Frankie Crosetti (SS)', 'Red Rolfe (3B)', 'Charlie Keller (RF)', 'Joe DiMaggio (CF)', 'Bill Dickey (C)', 'Joe Gordon (2B)', 'Tommy Henrich (1B)', 'George Selkirk (LF)', 'Babe Dahlgren (1B)'],
            '1955-bkn': ['Jim Gilliam (2B)', 'Pee Wee Reese (SS)', 'Duke Snider (CF)', 'Roy Campanella (C)', 'Gil Hodges (1B)', 'Jackie Robinson (3B)', 'Carl Furillo (RF)', 'Sandy Amoros (LF)', 'Don Zimmer (2B)'],
            '1961-nyy': ['Bobby Richardson (2B)', 'Tony Kubek (SS)', 'Roger Maris (RF)', 'Mickey Mantle (CF)', 'Elston Howard (C)', 'Yogi Berra (LF)', 'Bill Skowron (1B)', 'Clete Boyer (3B)', 'Hector Lopez (LF)'],
            '1969-nym': ['Tommie Agee (CF)', 'Bud Harrelson (SS)', 'Cleon Jones (LF)', 'Art Shamsky (RF)', 'Ed Kranepool (1B)', 'Ken Boswell (2B)', 'Jerry Grote (C)', 'Wayne Garrett (3B)', 'Ron Swoboda (RF)'],
            '1975-cin': ['Pete Rose (3B)', 'Ken Griffey (RF)', 'Joe Morgan (2B)', 'Johnny Bench (C)', 'Tony Perez (1B)', 'George Foster (LF)', 'Dave Concepcion (SS)', 'Cesar Geronimo (CF)', 'Dan Driessen (1B)'],
            '1984-det': ['Lou Whitaker (2B)', 'Alan Trammell (SS)', 'Kirk Gibson (RF)', 'Lance Parrish (C)', 'Darrell Evans (1B)', 'Chet Lemon (CF)', 'Larry Herndon (LF)', 'Tom Brookens (3B)', 'Dave Bergman (1B)'],
            '1986-nym': ['Lenny Dykstra (CF)', 'Wally Backman (2B)', 'Keith Hernandez (1B)', 'Gary Carter (C)', 'Darryl Strawberry (RF)', 'George Foster (LF)', 'Ray Knight (3B)', 'Rafael Santana (SS)', 'Mookie Wilson (OF)'],
            '1988-lad': ['Steve Sax (2B)', 'Mickey Hatcher (LF)', 'Kirk Gibson (RF)', 'Mike Marshall (1B)', 'John Shelby (CF)', 'Mike Scioscia (C)', 'Jeff Hamilton (3B)', 'Alfredo Griffin (SS)', 'Franklin Stubbs (1B)'],
            '1995-atl': ['Marquis Grissom (CF)', 'Mark Lemke (2B)', 'Chipper Jones (3B)', 'Fred McGriff (1B)', 'David Justice (RF)', 'Ryan Klesko (LF)', 'Javy Lopez (C)', 'Jeff Blauser (SS)', 'Mike Devereaux (OF)'],
            '1998-nyy': ['Chuck Knoblauch (2B)', 'Derek Jeter (SS)', 'Paul ONeill (RF)', 'Bernie Williams (CF)', 'Tino Martinez (1B)', 'Darryl Strawberry (DH)', 'Jorge Posada (C)', 'Scott Brosius (3B)', 'Chad Curtis (LF)'],
            '2001-sea': ['Ichiro Suzuki (RF)', 'Mark McLemore (LF)', 'Bret Boone (2B)', 'Edgar Martinez (DH)', 'John Olerud (1B)', 'Mike Cameron (CF)', 'David Bell (3B)', 'Dan Wilson (C)', 'Carlos Guillen (SS)'],
            '2004-bos': ['Johnny Damon (CF)', 'Orlando Cabrera (SS)', 'Manny Ramirez (LF)', 'David Ortiz (DH)', 'Kevin Millar (1B)', 'Trot Nixon (RF)', 'Jason Varitek (C)', 'Bill Mueller (3B)', 'Mark Bellhorn (2B)'],
            '2016-chc': ['Dexter Fowler (CF)', 'Kris Bryant (3B)', 'Anthony Rizzo (1B)', 'Ben Zobrist (LF)', 'Addison Russell (SS)', 'Willson Contreras (C)', 'Jason Heyward (RF)', 'Javier Baez (2B)', 'Kyle Schwarber (DH)'],
            '2017-hou': ['George Springer (CF)', 'Alex Bregman (3B)', 'Jose Altuve (2B)', 'Carlos Correa (SS)', 'Yuli Gurriel (1B)', 'Brian McCann (C)', 'Marwin Gonzalez (LF)', 'Josh Reddick (RF)', 'Carlos Beltran (DH)'],
            '2019-wsh': ['Trea Turner (SS)', 'Adam Eaton (RF)', 'Anthony Rendon (3B)', 'Juan Soto (LF)', 'Howie Kendrick (1B)', 'Asdrubal Cabrera (2B)', 'Victor Robles (CF)', 'Yan Gomes (C)', 'Kurt Suzuki (C)'],
            '2020-lad': ['Mookie Betts (RF)', 'Corey Seager (SS)', 'Justin Turner (3B)', 'Max Muncy (1B)', 'Will Smith (C)', 'Cody Bellinger (CF)', 'AJ Pollock (LF)', 'Chris Taylor (2B)', 'Joc Pederson (DH)'],
            '2021-atl': ['Jorge Soler (RF)', 'Freddie Freeman (1B)', 'Ozzie Albies (2B)', 'Austin Riley (3B)', 'Eddie Rosario (LF)', 'Adam Duvall (CF)', 'Dansby Swanson (SS)', 'Travis dArnaud (C)', 'Joc Pederson (DH)'],
            '2022-hou': ['Jose Altuve (2B)', 'Jeremy Pena (SS)', 'Yordan Alvarez (DH)', 'Alex Bregman (3B)', 'Kyle Tucker (RF)', 'Yuli Gurriel (1B)', 'Chas McCormick (CF)', 'Martin Maldonado (C)', 'Trey Mancini (LF)'],
            '2023-tex': ['Marcus Semien (2B)', 'Corey Seager (SS)', 'Adolis Garcia (RF)', 'Evan Carter (LF)', 'Josh Jung (3B)', 'Nathaniel Lowe (1B)', 'Mitch Garver (DH)', 'Jonah Heim (C)', 'Leody Taveras (CF)']
        };
        var pitchers = (HISTORICAL_PITCHERS[team && team.id] || []).map(function (row) { return { name: row[1], position: 'P' }; });
        return batters[key] ? { players: batters[key].map(function (name) { return { name: name.replace(/\s+\([A-Z0-9]+\)$/, ''), position: (name.match(/\(([A-Z0-9]+)\)$/) || [null, ''])[1] }; }).concat(pitchers), source: 'Curated historical roster names' } : null;
    }
    function rosterForTeam(team, roster) {
        var validated = validatedRosterForTeam(team, roster);
        if (validated && validated.players && validated.players.length) return validated;
        if (team && team.era === 'historical') return historicalRosterForTeam(team);
        return null;
    }
    function modeledBatterLines(team, line, random, roster) {
        var slots = ['CF', 'SS', 'RF', '1B', '3B', 'LF', 'DH', '2B', 'C'];
        var rosterNames = rosterNamesForBatters(roster, team);
        var hitWeights = [1.12, 1.02, 1.2, 1.15, 1.04, 0.98, 0.9, 0.86, 0.72];
        var runWeights = [1.2, 1.1, 1.18, 1.05, 0.92, 0.9, 0.78, 0.78, 0.58];
        var hits = weightedAllocate(line.hits, hitWeights, random, [5, 5, 5, 5, 4, 4, 4, 4, 4]);
        var runs = weightedAllocate(line.runs, runWeights, random, [4, 4, 4, 3, 3, 3, 3, 3, 3]);
        var rbiTotal = Math.max(0, line.runs - (random() < 0.35 ? 1 : 0));
        var rbi = weightedAllocate(rbiTotal, hitWeights.map(function (weight, index) { return weight + hits[index] * 0.45; }), random, [5, 5, 6, 6, 5, 5, 4, 4, 3]);
        var walks = weightedAllocate(clamp(Math.round(2 + random() * 4 + (team.offense - 100) * 0.04), 1, 8), runWeights, random, [3, 3, 3, 3, 3, 3, 2, 2, 2]);
        var strikeouts = weightedAllocate(clamp(Math.round(6 + random() * 5 - (team.offense - 100) * 0.03), 3, 14), [0.75, 0.9, 0.85, 0.95, 1.05, 1.1, 1.18, 1.2, 1.12], random, [3, 3, 3, 4, 4, 4, 4, 4, 4]);
        var extraBases = allocateExtraBaseHits(hits, line.runs, random);
        var steals = weightedAllocate(clamp(Math.round(random() * 2 + (team.volatility - 1) * 2), 0, 4), runWeights, random, [2, 2, 1, 1, 1, 1, 1, 1, 1]);
        var caught = weightedAllocate(clamp(Math.round(random() < 0.28 ? 1 : 0), 0, 2), runWeights, random, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
        return slots.map(function (slot, index) {
            var ab = clamp(3 + Math.floor(random() * 2) + (index < 5 && random() < 0.45 ? 1 : 0), 2, 6);
            if (ab < hits[index]) ab = hits[index];
            if (strikeouts[index] > ab - hits[index]) strikeouts[index] = Math.max(0, ab - hits[index]);
            return {
                name: rosterNames[index] || '',
                ab: ab,
                r: runs[index],
                h: hits[index],
                doubles: extraBases.doubles[index],
                triples: extraBases.triples[index],
                hr: extraBases.homers[index],
                rbi: rbi[index],
                bb: walks[index],
                so: strikeouts[index],
                sb: steals[index],
                cs: caught[index]
            };
        }).filter(function (row) { return row.name; });
    }
    function outsToIp(outs) {
        var innings = Math.floor(outs / 3);
        var remainder = outs % 3;
        return innings + (remainder ? '.' + remainder : '.0');
    }
    function modeledPitcherLines(team, opponentLine, starter, random, roster) {
        if (!roster || !roster.players || !roster.players.length) return [];
        var expectedDamage = opponentLine.runs + Math.max(0, opponentLine.hits - 7) * 0.35;
        var starterOuts = clamp(18 - Math.floor(expectedDamage * 0.8) + Math.floor(random() * 4), 12, 21);
        if (opponentLine.runs >= 7 || opponentLine.hits >= 13) starterOuts = clamp(starterOuts - 3, 9, 18);
        var reliefOuts = 27 - starterOuts;
        var secondRelief = reliefOuts >= 9 ? clamp(3 + Math.floor(random() * 3), 3, reliefOuts - 3) : Math.floor(reliefOuts / 2);
        var outs = [starterOuts, secondRelief, reliefOuts - secondRelief];
        var outWeights = outs.map(function (out) { return Math.max(1, out / 3); });
        var runs = weightedAllocate(opponentLine.runs, outWeights.map(function (weight, index) { return weight * (index === 0 ? 1.05 : 0.95); }), random, outs.map(function (out) { return clamp(Math.ceil(out / 3) + 3, 1, 8); }));
        var hitCaps = outs.map(function (out, index) {
            var cap = Math.ceil(out * 0.72) + runs[index] * 2 + (index === 0 ? 3 : 1);
            var max = index === 0 ? 12 : (out <= 3 ? 4 : 5);
            if (!runs[index] && out <= 6) max = Math.min(max, out <= 3 ? 3 : 4);
            return clamp(cap, 1, max);
        });
        var hits = weightedAllocate(opponentLine.hits, outWeights.map(function (weight, index) { return weight + runs[index] * 1.1; }), random, hitCaps);
        var walks = weightedAllocate(clamp(Math.round(2 + random() * 3), 1, 7), outWeights, random, outs.map(function (out) { return clamp(Math.ceil(out / 4) + 1, 1, 4); }));
        var strikeouts = weightedAllocate(clamp(Math.round(7 + random() * 5 + ((starter ? starter.quality : 100) - 100) * 0.05), 3, 15), outWeights.map(function (weight, index) { return weight * (index === 0 ? 1.15 : 0.9); }), random, outs.map(function (out) { return Math.max(1, out); }));
        var homers = weightedAllocate(clamp(Math.round(opponentLine.runs * 0.22 + random()), 0, 4), runs.map(function (run) { return run + 0.35; }), random, runs.map(function (run) { return Math.min(3, run); }));
        var rosterNames = rosterNamesForPitchers(roster, starter);
        var names = [rosterNames[0] || (starter && starter.name) || '', rosterNames[1] || '', rosterNames[2] || ''];
        var rows = names.map(function (name, index) {
            var pitches = clamp(Math.round(outs[index] * 3.8 + hits[index] * 4.9 + walks[index] * 5.4 + strikeouts[index] * 1.3 + runs[index] * 2.2 + random() * 8), Math.max(12, outs[index] * 3), 118);
            var strikes = clamp(Math.round(pitches * (0.61 + random() * 0.08) + strikeouts[index] * 0.7 - walks[index] * 0.8), Math.floor(pitches * 0.48), pitches);
            return {
                name: name,
                outs: outs[index],
                ip: outsToIp(outs[index]),
                h: hits[index],
                r: runs[index],
                er: Math.max(0, runs[index] - (runs[index] && random() < 0.16 ? 1 : 0)),
                bb: walks[index],
                so: strikeouts[index],
                hr: homers[index],
                pitches: pitches,
                strikes: strikes,
                ps: pitches + '-' + strikes
            };
        }).filter(function (row) { return row.name && row.outs > 0; });
        return rows;
    }
    function teamSummaryFromRows(line, players, opponentLine) {
        var batters = players && players.batters || [];
        var pitchers = players && players.pitchers || [];
        var walks = playerSum(batters, 'bb');
        var stolenBases = playerSum(batters, 'sb');
        var caughtStealing = playerSum(batters, 'cs');
        var leftOnBase = clamp(line.hits + walks + Math.max(0, opponentLine && opponentLine.errors || 0) - line.runs - stolenBases - caughtStealing, 2, 14);
        return {
            runs: line.runs,
            hits: line.hits,
            errors: line.errors,
            doubles: playerSum(batters, 'doubles'),
            triples: playerSum(batters, 'triples'),
            homeRuns: playerSum(batters, 'hr'),
            rbi: playerSum(batters, 'rbi'),
            walks: walks,
            strikeouts: playerSum(batters, 'so'),
            stolenBases: stolenBases,
            caughtStealing: caughtStealing,
            leftOnBase: leftOnBase,
            totalPitches: playerSum(pitchers, 'pitches'),
            totalStrikes: playerSum(pitchers, 'strikes')
        };
    }
    function modeledPlayerBox(away, home, awayLine, homeLine, awayPitcher, homePitcher, random, rosterContext) {
        var awayRoster = rosterForTeam(away, rosterContext && rosterContext.away);
        var homeRoster = rosterForTeam(home, rosterContext && rosterContext.home);
        return {
            away: {
                batters: modeledBatterLines(away, awayLine, random, awayRoster),
                pitchers: modeledPitcherLines(away, homeLine, awayPitcher, random, awayRoster),
                rosterSource: awayRoster && awayRoster.players && awayRoster.players.length ? (awayRoster.source || 'Projected lineup from verified active roster names') : 'Lineup unavailable. Verified roster data could not be loaded.'
            },
            home: {
                batters: modeledBatterLines(home, homeLine, random, homeRoster),
                pitchers: modeledPitcherLines(home, awayLine, homePitcher, random, homeRoster),
                rosterSource: homeRoster && homeRoster.players && homeRoster.players.length ? (homeRoster.source || 'Projected lineup from verified active roster names') : 'Lineup unavailable. Verified roster data could not be loaded.'
            }
        };
    }
    function buildBoxScore(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext) {
        var random = Math.random;
        var awayScore = controlledFinalScore(awayRuns, homeRuns, awayWin, random);
        var homeScore = controlledFinalScore(homeRuns, awayRuns, homeWin, random);
        if (awayScore === homeScore) {
            if (random() < homeWin) homeScore += 1;
            else awayScore += 1;
        }
        var combined = awayScore + homeScore;
        if (combined > 30) {
            var excess = combined - 30;
            while (excess > 0) {
                if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
                else if (homeScore > 0) homeScore -= 1;
                excess -= 1;
            }
            if (awayScore === homeScore) {
                if (random() < homeWin && awayScore > 0) awayScore -= 1;
                else if (homeScore > 0) homeScore -= 1;
            }
        }
        awayScore = clamp(awayScore, 0, 20);
        homeScore = clamp(homeScore, 0, 20);
        while (awayScore + homeScore > 30) {
            if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
            else if (homeScore > 0) homeScore -= 1;
            else break;
        }
        if (awayScore === homeScore) {
            if (random() < homeWin) {
                if (homeScore < 20 && awayScore + homeScore < 30) homeScore += 1;
                else if (awayScore > 0) awayScore -= 1;
            } else {
                if (awayScore < 20 && awayScore + homeScore < 30) awayScore += 1;
                else if (homeScore > 0) homeScore -= 1;
            }
        }
        while (awayScore + homeScore > 30) {
            if (awayScore >= homeScore && awayScore > 0) awayScore -= 1;
            else if (homeScore > 0) homeScore -= 1;
            else break;
        }
        var awayInnings = distributeRuns(awayScore, awayRuns, random, false);
        var homeInnings = distributeRuns(homeScore, homeRuns, random, true);
        var awayHits = hitTotalForRuns(awayScore, away, homePitcher, random);
        var homeHits = hitTotalForRuns(homeScore, home, awayPitcher, random);
        var awayErrors = errorTotal(away, random);
        var homeErrors = errorTotal(home, random);
        var winner = homeScore > awayScore ? home : away;
        var loser = homeScore > awayScore ? away : home;
        var winnerPitcher = homeScore > awayScore ? homePitcher : awayPitcher;
        var awayLate = awayInnings[6] + awayInnings[7] + awayInnings[8];
        var homeLate = homeInnings[6] + homeInnings[7] + homeInnings[8];
        var turningPoint = (awayLate || homeLate) ? 'Late innings swung ' + (homeLate >= awayLate ? home.abbreviation : away.abbreviation) + ' with a ' + Math.max(awayLate, homeLate) + '-run finish.' : 'The game stayed controlled after the starters set the run environment.';
        var awayLine = { team: away, innings: awayInnings, runs: awayScore, hits: awayHits, errors: awayErrors, starter: awayPitcher };
        var homeLine = { team: home, innings: homeInnings, runs: homeScore, hits: homeHits, errors: homeErrors, starter: homePitcher };
        var players = modeledPlayerBox(away, home, awayLine, homeLine, awayPitcher, homePitcher, random, rosterContext);
        awayLine.summaryStats = teamSummaryFromRows(awayLine, players.away, homeLine);
        homeLine.summaryStats = teamSummaryFromRows(homeLine, players.home, awayLine);
        return {
            runId: String(Date.now()) + '-' + Math.floor(random() * 1000000),
            away: awayLine,
            home: homeLine,
            winner: winner,
            loser: loser,
            players: players,
            summary: winner.name + ' defeats ' + loser.name + ', ' + Math.max(awayScore, homeScore) + '-' + Math.min(awayScore, homeScore) + '. ' + (winnerPitcher ? winnerPitcher.name + ' gives the winning side the stronger starter profile. ' : '') + turningPoint,
            pitcherLines: [
                away.name + ': ' + (awayPitcher ? awayPitcher.name : 'Starter unavailable') + ' / ' + clamp(5 + Math.round(random() * 2), 4, 7) + ' IP model line',
                home.name + ': ' + (homePitcher ? homePitcher.name : 'Starter unavailable') + ' / ' + clamp(5 + Math.round(random() * 2), 4, 7) + ' IP model line'
            ],
            keyPerformers: [
                winner.abbreviation + ' lineup: ' + Math.max(2, Math.min(5, Math.round(Math.max(awayScore, homeScore) / 2))) + ' run-scoring chances converted',
                loser.abbreviation + ' lineup: ' + Math.max(1, Math.min(4, Math.round(Math.min(awayScore, homeScore) / 2) + 1)) + ' scoring chances'
            ]
        };
    }
    function expectedRunsFor(offenseTeam, defenseTeam, homeBonus) {
        var offenseLift = (offenseTeam.offense - 100) * 0.047;
        var starterDrag = (100 - defenseTeam.startingPitching) * 0.029;
        var bullpenDrag = (100 - defenseTeam.bullpen) * 0.019;
        var preventionDrag = (100 - defenseTeam.runPrevention) * 0.021;
        return clamp(4.3 + offenseLift + starterDrag + bullpenDrag + preventionDrag + homeBonus, 1.7, 9.2);
    }
    function volatilityLabel(value) {
        if (value >= 1.07) return 'High';
        if (value <= 0.97) return 'Low';
        return 'Medium';
    }
    function confidenceLabel(winPct, strengthGap) {
        if (winPct >= 0.64 || strengthGap >= 9) return 'Strong lean';
        if (winPct >= 0.56 || strengthGap >= 5) return 'Moderate lean';
        return 'Tight matchup';
    }
    function eraAdjustmentNote(away, home) {
        if (away.era === 'historical' && home.era === 'historical') return 'Classic teams normalized by era';
        if (away.era === 'historical' || home.era === 'historical') return 'Cross-era ratings normalized';
        return 'Same-era current baseline';
    }
    function modeHelpText() {
        if (state.preset === 'historical') return 'Classic Teams mode compares curated historical clubs on era-normalized baseline ratings.';
        if (state.preset === 'mixed') return 'Mixed Era Matchup mode normalizes current and classic teams into one simulator baseline.';
        if (state.preset === 'custom') return 'Custom mode uses the selected pool for each side.';
        return 'Current Teams mode compares two modern MLB baseline profiles.';
    }
    function simulationModeLabel() {
        if (state.preset === 'historical') return 'Classic baseline';
        if (state.preset === 'mixed') return 'Mixed-era baseline';
        if (state.preset === 'custom') return 'Custom baseline';
        return 'Current baseline';
    }
    function verifiedLiveInputs() {
        return state.liveInputs.filter(function (source) { return source.verified; });
    }
    function dataModeLabel() {
        return verifiedLiveInputs().length ? 'Verified live inputs' : 'Baseline ratings';
    }
    function dataModeDetail() {
        if (state.awayPool === 'historical' || state.homePool === 'historical') return 'Classic and mixed-era matchups use historical baseline model ratings; live inputs are current-game only.';
        if (verifiedLiveInputs().length) return 'Verified live inputs are connected for this simulation where explicitly listed.';
        return 'Verified live inputs are unavailable, so this matchup will use internal baseline ratings.';
    }

    function parseRecord(summary) {
        var match = String(summary || '').match(/(\d+)\s*-\s*(\d+)/);
        if (!match) return null;
        var wins = Number(match[1]);
        var losses = Number(match[2]);
        var total = wins + losses;
        if (!total) return null;
        return { wins: wins, losses: losses, pct: wins / total, summary: wins + '-' + losses };
    }
    function recordFromCompetitor(comp) {
        var records = Array.isArray(comp && comp.records) ? comp.records : [];
        var overall = records.filter(function (record) { return record && (record.name === 'overall' || record.type === 'total'); })[0] || records[0];
        return parseRecord(overall && overall.summary);
    }
    function probableFromCompetitor(comp) {
        var probable = Array.isArray(comp && comp.probables) ? comp.probables[0] : null;
        if (!probable) return null;
        var eraStat = (probable.statistics || []).filter(function (stat) { return stat && String(stat.abbreviation || stat.name).toUpperCase() === 'ERA'; })[0];
        var era = eraStat ? Number(eraStat.displayValue) : null;
        return {
            name: probable.athlete && (probable.athlete.displayName || probable.athlete.fullName) || probable.displayName || 'Probable starter',
            record: probable.record || '',
            era: Number.isFinite(era) ? era : null
        };
    }
    function extractWeather(event) {
        var weather = event && event.weather || null;
        if (!weather) return null;
        var temp = Number(weather.temperature != null ? weather.temperature : weather.highTemperature);
        return {
            display: weather.displayValue || '',
            temperature: Number.isFinite(temp) ? temp : null,
            precipitation: Number(weather.precipitation),
            gust: Number(weather.gust)
        };
    }
    function extractEspnEvent(event) {
        var comp = event && event.competitions && event.competitions[0];
        var competitors = comp && Array.isArray(comp.competitors) ? comp.competitors : [];
        var home = competitors.filter(function (team) { return team.homeAway === 'home'; })[0];
        var away = competitors.filter(function (team) { return team.homeAway === 'away'; })[0];
        if (!home || !away) return null;
        var homeName = home.team && (home.team.displayName || home.team.name);
        var awayName = away.team && (away.team.displayName || away.team.name);
        return {
            id: event.id,
            homeTeam: homeName,
            awayTeam: awayName,
            commenceTime: event.date || comp.date,
            completed: !!(event.status && event.status.type && event.status.type.completed),
            statusDetail: event.status && event.status.type && (event.status.type.shortDetail || event.status.type.detail || event.status.type.description) || 'Scheduled',
            homeScore: home.score != null ? Number(home.score) : null,
            awayScore: away.score != null ? Number(away.score) : null,
            venue: comp.venue && comp.venue.fullName ? {
                name: comp.venue.fullName,
                city: comp.venue.address && comp.venue.address.city || '',
                state: comp.venue.address && comp.venue.address.state || '',
                indoor: comp.venue.indoor === true
            } : null,
            weather: extractWeather(event),
            homeRecord: recordFromCompetitor(home),
            awayRecord: recordFromCompetitor(away),
            homeStarter: probableFromCompetitor(home),
            awayStarter: probableFromCompetitor(away)
        };
    }
    function summaryForEvent(id) {
        return id && state.liveContext.espnSummaries ? state.liveContext.espnSummaries[id] || null : null;
    }
    function injuryStatus(item) {
        return item && (item.status || item.shortStatus || item.type && (item.type.abbreviation || item.type.description) || item.athlete && item.athlete.status && (item.athlete.status.abbreviation || item.athlete.status.name)) || '';
    }
    function injuryDetail(item) {
        return item && item.details && (item.details.type || item.details.detail || item.details.displayDetail || item.details.displayDescription) || '';
    }
    function injuryPosition(item) {
        return item && item.athlete && item.athlete.position && (item.athlete.position.abbreviation || item.athlete.position.displayName) || '';
    }
    function teamInjuryReport(summary, team) {
        var groups = Array.isArray(summary && summary.injuries) ? summary.injuries : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var injuries = group && Array.isArray(group.injuries) ? group.injuries : [];
        if (!injuries.length) return null;
        var ilCount = injuries.filter(function (item) { return /IL|injured/i.test(injuryStatus(item)); }).length;
        var dayToDay = injuries.filter(function (item) { return /day/i.test(injuryStatus(item)); }).length;
        var rpCount = injuries.filter(function (item) { return /RP|Relief/i.test(injuryPosition(item)); }).length;
        var notable = injuries.slice(0, 3).map(function (item) {
            var name = item && item.athlete && (item.athlete.displayName || item.athlete.fullName) || 'Listed player';
            var pos = injuryPosition(item);
            var status = injuryStatus(item);
            var detail = injuryDetail(item);
            return name + (pos ? ' ' + pos : '') + (status ? ' ' + status : '') + (detail ? ' - ' + detail : '');
        });
        return {
            count: injuries.length,
            ilCount: ilCount,
            dayToDay: dayToDay,
            relieverCount: rpCount,
            notable: notable,
            summary: injuries.length + ' listed' + (ilCount ? ', ' + ilCount + ' IL' : '') + (rpCount ? ', ' + rpCount + ' RP' : '')
        };
    }
    function collectRosterPlayers(entry) {
        var players = [];
        function add(item) {
            if (!item) return;
            var athlete = item.athlete || item;
            var name = athlete.displayName || athlete.fullName || athlete.name;
            if (!name) return;
            players.push({
                name: name,
                position: athlete.position && (athlete.position.abbreviation || athlete.position.displayName) || item.position && item.position.abbreviation || ''
            });
        }
        (entry.roster || []).forEach(add);
        (entry.athletes || []).forEach(add);
        (entry.groups || []).forEach(function (group) { (group.athletes || group.roster || []).forEach(add); });
        var seen = {};
        return players.filter(function (player) {
            var key = normalizeName(player.name);
            if (seen[key]) return false;
            seen[key] = true;
            return true;
        });
    }
    function teamRosterContext(summary, team) {
        var groups = Array.isArray(summary && summary.rosters) ? summary.rosters : [];
        var group = groups.filter(function (entry) { return entry && entry.team && normalizeName(entry.team.displayName) === normalizeName(team.name); })[0];
        var players = group ? collectRosterPlayers(group) : [];
        if (!players.length) return null;
        var relievers = players.filter(function (player) { return /RP|Relief/i.test(player.position); }).length;
        return { count: players.length, relievers: relievers, players: players, summary: players.length + ' ESPN summary roster players' + (relievers ? ', ' + relievers + ' RP' : ''), source: 'ESPN summary roster - not used for current player rows' };
    }
    function summaryContext(summary, away, home) {
        if (!summary) return null;
        var injuries = {
            away: teamInjuryReport(summary, away),
            home: teamInjuryReport(summary, home)
        };
        var rosters = {
            away: teamRosterContext(summary, away),
            home: teamRosterContext(summary, home)
        };
        if (!injuries.away && !injuries.home && !rosters.away && !rosters.home) return null;
        return { injuries: injuries, rosters: rosters };
    }
    function teamsMatch(gameLike, away, home) {
        if (!gameLike || !away || !home) return false;
        var awayNames = [gameLike.away_team, gameLike.awayTeam].map(normalizeName);
        var homeNames = [gameLike.home_team, gameLike.homeTeam].map(normalizeName);
        return awayNames.indexOf(normalizeName(away.name)) !== -1 && homeNames.indexOf(normalizeName(home.name)) !== -1;
    }
    function getMarket(game, key) {
        var bookmakers = Array.isArray(game && game.bookmakers) ? game.bookmakers : [];
        for (var b = 0; b < bookmakers.length; b += 1) {
            var markets = Array.isArray(bookmakers[b].markets) ? bookmakers[b].markets : [];
            for (var m = 0; m < markets.length; m += 1) {
                if (markets[m].key === key) return { bookmaker: bookmakers[b], market: markets[m] };
            }
        }
        return null;
    }
    function marketOddsFor(game, away, home) {
        var h2h = getMarket(game, 'h2h');
        var totals = getMarket(game, 'totals');
        if (!h2h || !Array.isArray(h2h.market.outcomes)) return null;
        var awayOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(away.name); })[0];
        var homeOutcome = h2h.market.outcomes.filter(function (outcome) { return normalizeName(outcome.name) === normalizeName(home.name); })[0];
        if (!awayOutcome || !homeOutcome) return null;
        var totalOutcome = totals && totals.market && Array.isArray(totals.market.outcomes) ? totals.market.outcomes[0] : null;
        return {
            book: h2h.bookmaker.title || h2h.bookmaker.key || 'Sportsbook board',
            updatedAt: game.updated_at || h2h.bookmaker.last_update || null,
            awayPrice: awayOutcome.price,
            homePrice: homeOutcome.price,
            total: totalOutcome && totalOutcome.point != null ? totalOutcome.point : null
        };
    }
    function impliedFromAmerican(price) {
        var n = Number(price);
        if (!Number.isFinite(n) || n === 0) return null;
        return n > 0 ? 100 / (n + 100) : Math.abs(n) / (Math.abs(n) + 100);
    }
    function selectedLiveContext(away, home) {
        if (!away || !home || away.era !== 'current' || home.era !== 'current') return null;
        var espnGame = (state.liveContext.espnEvents || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var scheduleGame = (state.liveContext.scheduleGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var boardGame = (state.liveContext.boardGames || []).filter(function (game) { return teamsMatch(game, away, home); })[0] || null;
        var recentForm = buildRecentForm(away, home);
        var summary = summaryForEvent(espnGame && espnGame.id);
        var extraContext = summaryContext(summary, away, home);
        if (!espnGame && !scheduleGame && !boardGame && !recentForm && !extraContext) return null;
        var odds = boardGame ? marketOddsFor(boardGame, away, home) : null;
        return { espnGame: espnGame, scheduleGame: scheduleGame, boardGame: boardGame, odds: odds, recentForm: recentForm, summary: summary, extraContext: extraContext };
    }
    function completedTeamResult(event, team) {
        if (!event || !event.completed || !team) return null;
        var isAway = normalizeName(event.awayTeam) === normalizeName(team.name);
        var isHome = normalizeName(event.homeTeam) === normalizeName(team.name);
        if (!isAway && !isHome) return null;
        var scored = isAway ? event.awayScore : event.homeScore;
        var allowed = isAway ? event.homeScore : event.awayScore;
        if (!Number.isFinite(scored) || !Number.isFinite(allowed)) return null;
        return {
            date: event.commenceTime,
            opponent: isAway ? event.homeTeam : event.awayTeam,
            scored: scored,
            allowed: allowed,
            won: scored > allowed,
            differential: scored - allowed
        };
    }
    function recentForTeam(team) {
        var games = (state.liveContext.recentEvents || [])
            .map(function (event) { return completedTeamResult(event, team); })
            .filter(Boolean)
            .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); })
            .slice(0, 5);
        if (!games.length) return null;
        var wins = games.filter(function (game) { return game.won; }).length;
        var runsFor = games.reduce(function (sum, game) { return sum + game.scored; }, 0);
        var runsAgainst = games.reduce(function (sum, game) { return sum + game.allowed; }, 0);
        return {
            games: games.length,
            wins: wins,
            losses: games.length - wins,
            runsFor: runsFor,
            runsAgainst: runsAgainst,
            runDiff: runsFor - runsAgainst,
            avgFor: round1(runsFor / games.length),
            avgAgainst: round1(runsAgainst / games.length),
            summary: wins + '-' + (games.length - wins) + ', ' + (runsFor - runsAgainst >= 0 ? '+' : '') + (runsFor - runsAgainst) + ' run diff'
        };
    }
    function buildRecentForm(away, home) {
        var awayForm = recentForTeam(away);
        var homeForm = recentForTeam(home);
        if (!awayForm && !homeForm) return null;
        return { away: awayForm, home: homeForm };
    }
    function liveInputsForContext(context) {
        var espnGame = context && context.espnGame;
        var scheduleGame = context && context.scheduleGame;
        var odds = context && context.odds;
        var recentForm = context && context.recentForm;
        var extra = context && context.extraContext;
        var weather = espnGame && espnGame.weather;
        var injuryAvailable = !!(extra && extra.injuries && (extra.injuries.away || extra.injuries.home));
        var rosterAvailable = !!(extra && extra.rosters && extra.rosters.away && extra.rosters.home);
        var bullpenAvailable = !!(extra && ((extra.injuries && ((extra.injuries.away && extra.injuries.away.relieverCount) || (extra.injuries.home && extra.injuries.home.relieverCount))) || (extra.rosters && extra.rosters.away && extra.rosters.home && (extra.rosters.away.relievers || extra.rosters.home.relievers))));
        var startersAvailable = !!(espnGame && espnGame.awayStarter && espnGame.homeStarter);
        var recordsAvailable = !!(espnGame && espnGame.awayRecord && espnGame.homeRecord);
        var recentAvailable = !!(recentForm && recentForm.away && recentForm.home);
        return [
            {
                key: 'scheduleFinals',
                label: 'MLB schedule/finals',
                verified: !!(espnGame || scheduleGame),
                status: (espnGame || scheduleGame) ? ((espnGame && espnGame.completed) || (scheduleGame && scheduleGame.completed) ? 'Final score available' : 'Scheduled game found') : 'Unavailable',
                detail: (espnGame && espnGame.statusDetail) || (scheduleGame && scheduleGame.commence_time ? 'Scheduled ' + new Date(scheduleGame.commence_time).toLocaleString() : 'No matching current MLB game found.')
            },
            {
                key: 'teamRecords',
                label: 'Team records',
                verified: recordsAvailable,
                status: recordsAvailable ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: recordsAvailable ? espnGame.awayTeam + ' ' + espnGame.awayRecord.summary + ' / ' + espnGame.homeTeam + ' ' + espnGame.homeRecord.summary : 'No verified record match available.'
            },
            {
                key: 'startingPitchers',
                label: 'Probable starters',
                verified: startersAvailable,
                status: startersAvailable ? 'Probable starters available' : 'Unavailable',
                detail: startersAvailable ? espnGame.awayStarter.name + ' vs ' + espnGame.homeStarter.name : 'No confirmed or probable starter match available.'
            },
            {
                key: 'confirmedStarters',
                label: 'Confirmed starter status',
                verified: false,
                status: 'Unavailable',
                detail: startersAvailable ? 'ESPN lists probable starters; confirmed starter status is not connected.' : 'No confirmed starter status match available.'
            },
            {
                key: 'ballpark',
                label: 'Ballpark',
                verified: !!(espnGame && espnGame.venue),
                status: espnGame && espnGame.venue ? 'Ballpark available' : 'Unavailable',
                detail: espnGame && espnGame.venue ? espnGame.venue.name + (espnGame.venue.city ? ', ' + espnGame.venue.city : '') + '.' : 'No verified venue match available.'
            },
            {
                key: 'weather',
                label: 'Weather',
                verified: !!weather,
                status: weather ? 'Available from ESPN scoreboard' : 'Unavailable',
                detail: weather ? [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') : 'No verified weather match available.'
            },
            {
                key: 'sportsbookOdds',
                label: 'Sportsbook odds',
                verified: !!odds,
                status: odds ? 'Available from backend board' : 'Unavailable',
                detail: odds ? odds.book + ' moneyline snapshot; used as market context, not a betting edge.' : 'No verified sportsbook odds match available.'
            },
            {
                key: 'injuryReport',
                label: 'Injury report',
                verified: injuryAvailable,
                status: injuryAvailable ? 'Available from ESPN summary' : 'Unavailable',
                detail: injuryAvailable ? [extra.injuries.away ? espnGame.awayTeam + ': ' + extra.injuries.away.summary : espnGame.awayTeam + ': none listed', extra.injuries.home ? espnGame.homeTeam + ': ' + extra.injuries.home.summary : espnGame.homeTeam + ': none listed'].join(' / ') : 'No verified injury report match available.'
            },
            {
                key: 'recentForm',
                label: 'Recent scoring form',
                status: recentAvailable ? 'Available from ESPN final scores' : 'Unavailable',
                detail: recentAvailable ? 'Last ' + recentForm.away.games + ': ' + recentForm.away.summary + ' / Last ' + recentForm.home.games + ': ' + recentForm.home.summary : 'No verified recent final-score sample matched both teams.',
                verified: recentAvailable
            },
            { key: 'rosterContext', label: 'Roster context', status: rosterAvailable ? 'Available from active roster payload' : 'Unavailable', detail: rosterAvailable ? espnGame.awayTeam + ': ' + extra.rosters.away.summary + ' / ' + espnGame.homeTeam + ': ' + extra.rosters.home.summary : 'No verified player roster list is connected for this matchup.', verified: rosterAvailable },
            { key: 'bullpenContext', label: 'Bullpen context', status: bullpenAvailable ? 'Bullpen injury/depth context available' : 'Unavailable', detail: bullpenAvailable ? 'Derived from ESPN roster/injury context only; workload and availability are not connected.' : 'No verified bullpen depth, workload, or availability feed is connected.', verified: bullpenAvailable }
        ];
    }
    function setLiveInputsForMatchup(away, home) {
        state.activeLiveContext = selectedLiveContext(away, home);
        state.liveInputs = liveInputsForContext(state.activeLiveContext);
        state.dataMode = verifiedLiveInputs().length ? 'live' : 'baseline';
    }

    function starterEraAdjustment(starter) {
        if (!starter || !Number.isFinite(starter.era)) return 0;
        return clamp((starter.era - 4.2) * 0.22, -0.45, 0.55);
    }
    function selectedPitcherRunAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((100 - pitcher.quality) * 0.028, -0.58, 0.52);
    }
    function selectedPitcherStrengthAdjustment(pitcher) {
        if (!pitcher) return 0;
        return clamp((pitcher.quality - 100) * 0.24, -4.2, 5.4);
    }
    function recordStrengthAdjustment(record) {
        if (!record || !Number.isFinite(record.pct)) return 0;
        return clamp((record.pct - 0.5) * 9, -3.5, 3.5);
    }
    function injuryStrengthPenalty(report) {
        if (!report) return 0;
        return clamp((report.ilCount * 0.32) + (report.dayToDay * 0.12) + (report.relieverCount * 0.12), 0, 2.8);
    }
    function simulate(away, home, context, seedSalt, allowUpset) {
        var awayRuns = expectedRunsFor(away, home, 0);
        var homeRuns = expectedRunsFor(home, away, 0.18);
        var liveFactors = [];
        var awayPitcher = selectedPitcher('away', away, context);
        var homePitcher = selectedPitcher('home', home, context);
        awayRuns = clamp(awayRuns + selectedPitcherRunAdjustment(homePitcher), 1.7, 9.2);
        homeRuns = clamp(homeRuns + selectedPitcherRunAdjustment(awayPitcher), 1.7, 9.2);
        var awayStrength = strength(away);
        var homeStrength = strength(home) + 1.7;
        awayStrength += selectedPitcherStrengthAdjustment(awayPitcher);
        homeStrength += selectedPitcherStrengthAdjustment(homePitcher);
        if (awayPitcher && homePitcher) {
            liveFactors.push('Starting Pitchers: ' + away.name + ': ' + awayPitcher.name + ' (' + awayPitcher.source + ', ' + (awayPitcher.verified ? 'verified probable' : 'modeled input') + '); ' + home.name + ': ' + homePitcher.name + ' (' + homePitcher.source + ', ' + (homePitcher.verified ? 'verified probable' : 'modeled input') + ').');
        }
        if (awayPitcher && homePitcher && Math.abs(awayPitcher.quality - homePitcher.quality) >= 7) {
            liveFactors.push('Starting pitching matchup: ' + (awayPitcher.quality > homePitcher.quality ? awayPitcher.name : homePitcher.name) + ' grades higher in this simulator profile and moves the run projection.');
        }
        if (context && context.espnGame) {
            awayStrength += recordStrengthAdjustment(context.espnGame.awayRecord);
            homeStrength += recordStrengthAdjustment(context.espnGame.homeRecord);
            if (context.espnGame.awayRecord && context.espnGame.homeRecord) {
                liveFactors.push('Team records: ' + away.abbreviation + ' ' + context.espnGame.awayRecord.summary + ', ' + home.abbreviation + ' ' + context.espnGame.homeRecord.summary + '.');
            }
            if (context.espnGame.venue) {
                liveFactors.push('Ballpark context: ' + context.espnGame.venue.name + ' is verified from ESPN.');
            }
            if (context.espnGame.weather) {
                var weather = context.espnGame.weather;
                if (weather.temperature != null && weather.temperature >= 80) {
                    awayRuns = clamp(awayRuns + 0.08, 1.7, 9.2);
                    homeRuns = clamp(homeRuns + 0.08, 1.7, 9.2);
                }
                if (Number.isFinite(weather.precipitation) && weather.precipitation > 0) {
                    awayRuns = clamp(awayRuns - 0.04, 1.7, 9.2);
                    homeRuns = clamp(homeRuns - 0.04, 1.7, 9.2);
                }
                liveFactors.push('Weather context from ESPN: ' + [weather.temperature != null ? weather.temperature + 'F' : '', weather.display || '', Number.isFinite(weather.gust) ? 'gust ' + weather.gust + ' mph' : ''].filter(Boolean).join(' / ') + '.');
            }
        }
        if (context && context.extraContext && context.extraContext.injuries) {
            var awayInjuries = context.extraContext.injuries.away;
            var homeInjuries = context.extraContext.injuries.home;
            if (awayInjuries) awayStrength -= injuryStrengthPenalty(awayInjuries);
            if (homeInjuries) homeStrength -= injuryStrengthPenalty(homeInjuries);
            if (awayInjuries || homeInjuries) {
                liveFactors.push('ESPN injury report: ' + away.abbreviation + ' ' + (awayInjuries ? awayInjuries.summary : 'none listed') + '; ' + home.abbreviation + ' ' + (homeInjuries ? homeInjuries.summary : 'none listed') + '.');
            }
        }
        if (context && context.extraContext && context.extraContext.rosters && context.extraContext.rosters.away && context.extraContext.rosters.home) {
            liveFactors.push('ESPN summary roster context was detected but is not used for current-team player rows; player identities require the MLB active roster endpoint.');
        }
        if (context && context.extraContext && context.extraContext.injuries && ((context.extraContext.injuries.away && context.extraContext.injuries.away.relieverCount) || (context.extraContext.injuries.home && context.extraContext.injuries.home.relieverCount))) {
            liveFactors.push('Bullpen context is limited to reliever injury listings; live workload and availability are not connected.');
        }
        if (context && context.recentForm) {
            if (context.recentForm.away) {
                awayRuns = clamp(awayRuns + clamp((context.recentForm.away.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                awayStrength += clamp(context.recentForm.away.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.home) {
                homeRuns = clamp(homeRuns + clamp((context.recentForm.home.avgFor - 4.4) * 0.08, -0.28, 0.28), 1.7, 9.2);
                homeStrength += clamp(context.recentForm.home.runDiff * 0.12, -2.5, 2.5);
            }
            if (context.recentForm.away && context.recentForm.home) {
                liveFactors.push('Recent scoring form from ESPN finals: ' + away.abbreviation + ' ' + context.recentForm.away.summary + '; ' + home.abbreviation + ' ' + context.recentForm.home.summary + '.');
            }
        }
        var homeWin = clamp(1 / (1 + Math.exp(-(((homeRuns - awayRuns) * 0.55) + ((homeStrength - awayStrength) * 0.027)))), 0.17, 0.83);
        if (context && context.odds) {
            var awayImp = impliedFromAmerican(context.odds.awayPrice);
            var homeImp = impliedFromAmerican(context.odds.homePrice);
            if (awayImp != null && homeImp != null) {
                var noVigHome = homeImp / (homeImp + awayImp);
                homeWin = clamp((homeWin * 0.85) + (noVigHome * 0.15), 0.17, 0.83);
                liveFactors.push('Market context: ' + context.odds.book + ' moneyline snapshot is included, but no betting edge is claimed.');
            }
            if (context.odds.total != null) {
                liveFactors.push('Market total snapshot: ' + context.odds.total + ' runs.');
            }
        }
        var awayWin = 1 - homeWin;
        var winner = homeWin >= awayWin ? home : away;
        var winnerPct = Math.max(homeWin, awayWin);
        var volatility = clamp((away.volatility + home.volatility) / 2, 0.92, 1.16);
        var spread = round1(1.1 * volatility);
        var totalRuns = awayRuns + homeRuns;
        var rosterContext = rostersForTeams(away, home, context);
        var boxScore = buildBoxScore(away, home, awayPitcher, homePitcher, awayRuns, homeRuns, awayWin, homeWin, seedSalt, allowUpset, rosterContext);
        var projectedAwayScore = boxScore.away.runs;
        var projectedHomeScore = boxScore.home.runs;
        var finalWinner = boxScore.winner;
        var reasonParts = [];
        reasonParts.push(winner.name + ' projects ahead because the run expectation and composite team rating lean their way.');
        if (Math.abs(away.offense - home.offense) >= 4) reasonParts.push(edgeLabel('offense', away, home) + ' on offense.');
        if (Math.abs(away.startingPitching - home.startingPitching) >= 4) reasonParts.push(edgeLabel('startingPitching', away, home) + ' in starting pitching.');
        if (Math.abs(away.bullpen - home.bullpen) >= 4) reasonParts.push(edgeLabel('bullpen', away, home) + ' in bullpen baseline.');
        if (awayPitcher && homePitcher) reasonParts.push('Selected starters: ' + awayPitcher.name + ' vs ' + homePitcher.name + '.');
        return {
            status: 'estimated',
            away: away,
            home: home,
            winner: winner,
            winnerPct: winnerPct,
            awayWin: awayWin,
            homeWin: homeWin,
            awayRuns: round1(awayRuns),
            homeRuns: round1(homeRuns),
            projectedAwayScore: projectedAwayScore,
            projectedHomeScore: projectedHomeScore,
            finalWinner: finalWinner,
            boxScore: boxScore,
            awayRange: [round1(Math.max(0.5, awayRuns - spread)), round1(awayRuns + spread)],
            homeRange: [round1(Math.max(0.5, homeRuns - spread)), round1(homeRuns + spread)],
            totalRange: [round1(Math.max(2, totalRuns - spread * 1.35)), round1(totalRuns + spread * 1.35)],
            runEnvironment: totalRuns >= 9.8 ? 'Elevated' : (totalRuns <= 7.4 ? 'Suppressed' : 'Balanced'),
            volatility: volatilityLabel(volatility),
            strengthGap: round1(Math.abs(homeStrength - awayStrength)),
            confidence: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            confidenceBand: confidenceLabel(winnerPct, Math.abs(homeStrength - awayStrength)),
            eraAdjustment: eraAdjustmentNote(away, home),
            simulationMode: simulationModeLabel(),
            dataMode: dataModeLabel(),
            dataLimitations: dataModeDetail(),
            dataSourcesUsed: verifiedLiveInputs().map(function (source) { return source.label; }),
            missingDataSources: state.liveInputs.filter(function (source) { return !source.verified; }).map(function (source) { return source.label; }),
            liveFactors: liveFactors,
            offensiveEdge: edgeLabel('offense', away, home),
            pitchingEdge: edgeLabel('startingPitching', away, home),
            runPreventionEdge: edgeLabel('runPrevention', away, home),
            bullpenEdge: edgeLabel('bullpen', away, home),
            keyExplanation: reasonParts.join(' '),
            awayPitcher: awayPitcher,
            homePitcher: homePitcher
        };
    }

    function teamOption(team) {
        return '<option value="' + escapeHtml(team.id) + '">' + escapeHtml(team.name) + '</option>';
    }
    function ensurePitcherSelection(side, team, context) {
        var options = pitcherOptionsFor(team, side, context);
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var touchedKey = side === 'away' ? 'awayPitcherTouched' : 'homePitcherTouched';
        if (!options.length) {
            state[key] = '';
            return null;
        }
        if (!options.filter(function (pitcher) { return pitcher.id === state[key]; })[0] || (!state[touchedKey] && options[0].verified)) state[key] = options[0].id;
        return options;
    }
    function renderPitcherOptions(side, team, context) {
        var options = ensurePitcherSelection(side, team, context) || [];
        var select = byId(side === 'away' ? 'awayPitcherSelect' : 'homePitcherSelect');
        var meta = byId(side === 'away' ? 'awayPitcherMeta' : 'homePitcherMeta');
        var key = side === 'away' ? 'awayPitcherId' : 'homePitcherId';
        var pitcher = selectedPitcher(side, team, context);
        if (select) {
            select.innerHTML = options.length ? options.map(function (option) { return pitcherOptionTag(option, option.id === state[key]); }).join('') : '<option value="">Starting pitcher list unavailable</option>';
            select.value = state[key] || '';
            select.disabled = !options.length;
        }
        if (meta) meta.textContent = pitcherMeta(pitcher);
    }

    function renderSelectors() {
        var awayTeams = poolTeams(state.awayPool);
        var homeTeams = poolTeams(state.homePool);
        if (!findTeamInPool(state.awayTeamId, state.awayPool)) state.awayTeamId = awayTeams[0] ? awayTeams[0].id : '';
        if (!findTeamInPool(state.homeTeamId, state.homePool)) state.homeTeamId = homeTeams[1] ? homeTeams[1].id : (homeTeams[0] ? homeTeams[0].id : '');
        if (state.awayTeamId === state.homeTeamId && homeTeams.length > 1) state.homeTeamId = homeTeams.filter(function (team) { return team.id !== state.awayTeamId; })[0].id;

        var awayPoolSelect = byId('awayPoolSelect');
        var homePoolSelect = byId('homePoolSelect');
        var awaySelect = byId('awayTeamSelect');
        var homeSelect = byId('homeTeamSelect');
        if (awayPoolSelect) awayPoolSelect.value = state.awayPool;
        if (homePoolSelect) homePoolSelect.value = state.homePool;
        if (awaySelect) {
            awaySelect.disabled = false;
            awaySelect.innerHTML = awayTeams.map(teamOption).join('');
            awaySelect.value = state.awayTeamId;
        }
        if (homeSelect) {
            homeSelect.disabled = false;
            homeSelect.innerHTML = homeTeams.map(teamOption).join('');
            homeSelect.value = state.homeTeamId;
        }

        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        setLiveInputsForMatchup(away, home);
        renderPitcherOptions('away', away, state.activeLiveContext);
        renderPitcherOptions('home', home, state.activeLiveContext);
        renderTeamIdentity('awayPickerIdentity', away, 'Team A');
        renderTeamIdentity('homePickerIdentity', home, 'Team B');
        setLogo('awayHeaderLogo', away, 'header-logo');
        setLogo('homeHeaderLogo', home, 'header-logo');
        setLogo('awayScoreLogo', away, 'score-logo');
        setLogo('homeScoreLogo', home, 'score-logo');
        applyAccent('awayPickerIdentity', away);
        applyAccent('homePickerIdentity', home);
        applyAccent('resultCard', away);
        setText('awayTeamMeta', teamMeta(away));
        setText('homeTeamMeta', teamMeta(home));
        setText('selectedMatchupTitle', away && home ? away.name + ' vs ' + home.name : 'Choose two teams');
        setText('awayHeaderName', away ? away.name : 'Select Team A');
        setText('homeHeaderName', home ? home.name : 'Select Team B');
        setText('awayHeaderMeta', teamMeta(away));
        setText('homeHeaderMeta', teamMeta(home));
        setText('awayEraBadge', eraLabel(away));
        setText('homeEraBadge', eraLabel(home));
        renderDataModeStatus();
        setText('simBoardMessage', 'Baseline simulator loaded: Team A has ' + awayTeams.length + ' ' + (state.awayPool === 'historical' ? 'classic' : 'current') + ' teams; Team B has ' + homeTeams.length + ' ' + (state.homePool === 'historical' ? 'classic' : 'current') + ' teams.');
        setText('modeHelpText', modeHelpText());

        var run = byId('runSimulationButton');
        if (run) run.disabled = !(away && home && away.id !== home.id);
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (current) current.classList.toggle('active', state.preset === 'current');
        if (historical) historical.classList.toggle('active', state.preset === 'historical');
        if (mixed) mixed.classList.toggle('active', state.preset === 'mixed');
    }

    function renderDataModeStatus() {
        var verifiedCount = verifiedLiveInputs().length;
        setText('simDataSourceTitle', verifiedCount ? 'Verified input mode' : 'Baseline ratings mode');
        setText('simDataSourceDetail', verifiedCount ? 'Using verified live inputs where available plus baseline ratings.' : 'Using internal baseline team ratings and historical context only.');
        setText('dataModeBadge', dataModeLabel());
        setText('dataModeDetail', dataModeDetail());
        var grid = byId('liveInputGrid');
        if (!grid) return;
        var verified = verifiedLiveInputs();
        if (!verified.length) {
            grid.innerHTML = '<div class="data-note-line">Verified live inputs appear when available. This simulator currently uses baseline team and starter profiles when verified live feeds are unavailable.</div>';
            return;
        }
        grid.innerHTML = '<div class="data-note-line"><strong>Verified sources used:</strong> ' + escapeHtml(verified.map(function (source) { return source.label; }).join(', ')) + '. Missing live feeds are not guessed or displayed as facts.</div>';
    }

    function renderComparison(result) {
        var container = byId('comparisonGrid');
        if (!container) return;
        if (!result) {
            container.innerHTML = '<div class="sim-empty">Run a simulation to compare team strength, offense, pitching/run prevention, and volatility.</div>';
            return;
        }
        var rows = [
            ['Overall Strength', Math.round(strength(result.away)), Math.round(strength(result.home))],
            ['Offense', result.away.offense, result.home.offense],
            ['Run Prevention', result.away.runPrevention, result.home.runPrevention],
            ['Starting Pitching', result.away.startingPitching, result.home.startingPitching],
            ['Bullpen', result.away.bullpen, result.home.bullpen],
            ['Volatility', Math.round(result.away.volatility * 100), Math.round(result.home.volatility * 100)]
        ];
        container.innerHTML = rows.map(function (row) {
            return '<article class="comparison-card"><h3>' + escapeHtml(row[0]) + '</h3>' +
                '<div class="comparison-bar"><span style="width:' + clamp(row[1], 8, 100) + '%"></span><strong>' + row[1] + '</strong></div>' +
                '<div class="comparison-bar home"><span style="width:' + clamp(row[2], 8, 100) + '%"></span><strong>' + row[2] + '</strong></div></article>';
        }).join('');
    }

    function renderInputStatus(result) {
        var container = byId('inputSummary');
        if (!container) return;
        var usedSources = result && result.dataSourcesUsed && result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings';
        var rows = result ? [
            ['Winner', result.winner.name + ' ' + roundPct(result.winnerPct)],
            ['Starting pitchers', result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + ' / ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable')],
            ['Run environment', result.runEnvironment + ' / ' + result.totalRange[0] + '-' + result.totalRange[1] + ' runs'],
            ['Simulation mode', result.simulationMode],
            ['Data mode', result.dataMode],
            ['Data sources used', usedSources],
            ['Offensive edge', result.offensiveEdge],
            ['Pitching edge', result.pitchingEdge],
            ['Run prevention edge', result.runPreventionEdge],
            ['Era adjustment', result.eraAdjustment],
            ['Confidence band', result.confidenceBand],
            ['Volatility', result.volatility],
            ['SportsDataIO', 'Not used for this estimate'],
            ['Sportsbook odds', result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Verified backend board snapshot used as context' : 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ] : [
            ['Dataset', 'Internal baseline team ratings'],
            ['Starting pitchers', 'Choose starters for both teams'],
            ['Data mode', dataModeLabel()],
            ['Live inputs', 'Shown only when matched to verified sources'],
            ['Sportsbook odds', 'Not used / not invented'],
            ['Official records', 'Excluded from picks and records']
        ];
        container.innerHTML = rows.map(function (row) {
            return '<div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
    }

    function renderNotes(result) {
        var list = byId('matchupNotes');
        if (!list) return;
        var liveFactorNotes = result && result.liveFactors && result.liveFactors.length ? result.liveFactors : [];
        var fallbackOnly = !result || !result.dataSourcesUsed || !result.dataSourcesUsed.length;
        var notes = result ? [
            result.dataSourcesUsed.indexOf('Sportsbook odds') !== -1 ? 'Simulation-based estimate with a verified market snapshot included as context; this is not a betting edge.' : 'Simulation-based estimate, not sportsbook odds or provider projection.',
            result.winner.name + ' grades as the simulated winner because of baseline run expectation and team-strength weighting.',
            'Starting Pitchers: ' + result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + '; ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable') + '.',
            'Average simulated score: ' + result.away.abbreviation + ' ' + result.awayRuns + ', ' + result.home.abbreviation + ' ' + result.homeRuns + '.',
            'Projected score range: ' + result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ', ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1] + '.',
            'Simulation mode used: ' + result.simulationMode + '.',
            'Data mode used: ' + result.dataMode + '.',
            'Era adjustment: ' + result.eraAdjustment + '.',
            'Confidence band: ' + result.confidenceBand + ' based only on internal simulation strength.',
            'Data sources used: ' + (result.dataSourcesUsed.length ? result.dataSourcesUsed.join(', ') : 'Internal baseline team ratings only') + '.',
            'Data limitations: ' + result.dataLimitations,
            fallbackOnly ? 'Baseline simulator profiles are used when verified live feeds are unavailable.' : 'Live context is used only for verified sources; missing feeds are not guessed.'
        ].concat(liveFactorNotes) : [
            'Choose a mode, select two teams, and run the simulator. Current and historical options are loaded locally, so failed provider data will not block this tool.',
            'Simulator baselines are internal ratings. They are not SportsDataIO data, sportsbook odds, betting-edge claims, official picks, or graded records.'
        ];
        list.innerHTML = notes.map(function (note) { return '<li>' + escapeHtml(note) + '</li>'; }).join('');
    }
    function sum(values) {
        return values.reduce(function (total, value) { return total + Number(value || 0); }, 0);
    }
    function formatAverage(value) {
        if (!Number.isFinite(value)) return '.000';
        var text = Math.max(0, value).toFixed(3);
        return text.replace(/^0/, '');
    }
    function batterAverage(row) {
        return formatAverage(Number(row && row.h || 0) / Math.max(1, Number(row && row.ab || 0)));
    }
    function batterOps(row) {
        var ab = Math.max(1, Number(row && row.ab || 0));
        var hits = Number(row && row.h || 0);
        var walks = Number(row && row.bb || 0);
        var doubles = Number(row && row.doubles || 0);
        var triples = Number(row && row.triples || 0);
        var homers = Number(row && row.hr || 0);
        var singles = Math.max(0, hits - doubles - triples - homers);
        var totalBases = singles + doubles * 2 + triples * 3 + homers * 4;
        return formatAverage((hits + walks) / Math.max(1, ab + walks) + totalBases / ab);
    }
    function pitcherEra(row) {
        var outs = Number(row && row.outs || 0);
        if (!outs) return '--';
        return ((Number(row.er || 0) * 27) / outs).toFixed(2);
    }
    function boxRow(line, winnerId) {
        var isWinner = line.team.id === winnerId;
        return '<tr class="' + (isWinner ? 'winner-row' : '') + '"><th scope="row"><span class="line-score-team">' + logoMarkup(line.team, 'line-score-logo') + '<span><strong>' + escapeHtml(line.team.abbreviation) + '</strong><small>' + escapeHtml(line.team.era === 'historical' ? line.team.season : line.team.division) + '</small></span></span></th>' +
            line.innings.map(function (runs) { return '<td>' + runs + '</td>'; }).join('') +
            '<td class="total-runs">' + line.runs + '</td><td>' + line.hits + '</td><td>' + line.errors + '</td></tr>';
    }
    function batterTotals(rows) {
        return {
            ab: playerSum(rows, 'ab'),
            r: playerSum(rows, 'r'),
            h: playerSum(rows, 'h'),
            rbi: playerSum(rows, 'rbi'),
            bb: playerSum(rows, 'bb'),
            so: playerSum(rows, 'so')
        };
    }
    function batterTableRows(rows) {
        var body = rows.map(function (row) {
            return '<tr><th scope="row">' + escapeHtml(row.name) + '</th><td>' + row.ab + '</td><td>' + row.r + '</td><td>' + row.h + '</td><td>' + row.rbi + '</td><td>' + row.bb + '</td><td>' + row.so + '</td><td>' + batterAverage(row) + '</td><td>' + batterOps(row) + '</td></tr>';
        }).join('');
        var totals = batterTotals(rows);
        return body + '<tr class="player-total-row"><th scope="row">Totals</th><td>' + totals.ab + '</td><td>' + totals.r + '</td><td>' + totals.h + '</td><td>' + totals.rbi + '</td><td>' + totals.bb + '</td><td>' + totals.so + '</td><td></td><td></td></tr>';
    }
    function pitcherDisplayName(row, decisions) {
        var label = decisions && decisions[row.name];
        return row.name + (label ? ' (' + label + ')' : '');
    }
    function pitcherTableRows(rows, decisions) {
        var body = rows.map(function (row) {
            return '<tr><th scope="row">' + escapeHtml(pitcherDisplayName(row, decisions)) + '</th><td>' + escapeHtml(row.ip) + '</td><td>' + row.h + '</td><td>' + row.r + '</td><td>' + row.er + '</td><td>' + row.bb + '</td><td>' + row.so + '</td><td>' + row.hr + '</td><td>' + pitcherEra(row) + '</td></tr>';
        }).join('');
        return body + '<tr class="player-total-row"><th scope="row">Totals</th><td>9.0</td><td>' + playerSum(rows, 'h') + '</td><td>' + playerSum(rows, 'r') + '</td><td>' + playerSum(rows, 'er') + '</td><td>' + playerSum(rows, 'bb') + '</td><td>' + playerSum(rows, 'so') + '</td><td>' + playerSum(rows, 'hr') + '</td><td></td></tr>';
    }
    function teamTotalCard(line) {
        var stats = line.summaryStats || {};
        var rows = [
            ['R', stats.runs],
            ['H', stats.hits],
            ['E', stats.errors],
            ['2B', stats.doubles],
            ['3B', stats.triples],
            ['HR', stats.homeRuns],
            ['RBI', stats.rbi],
            ['BB', stats.walks],
            ['SO', stats.strikeouts],
            ['SB', stats.stolenBases],
            ['CS', stats.caughtStealing],
            ['LOB', stats.leftOnBase],
            ['Pitches', stats.totalPitches],
            ['P-S', stats.totalPitches != null && stats.totalStrikes != null ? stats.totalPitches + '-' + stats.totalStrikes : '']
        ];
        return '<article><h3>' + escapeHtml(line.team.abbreviation) + ' Totals</h3><dl>' + rows.map(function (row) {
            return '<div><dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1] != null ? row[1] : 0) + '</dd></div>';
        }).join('') + '</dl></article>';
    }
    function renderTeamTotals(box) {
        return teamTotalCard(box.away) + teamTotalCard(box.home);
    }
    function pitcherDecisionLine(result, box) {
        var winnerPitcher = box.winner.id === result.home.id ? result.homePitcher : result.awayPitcher;
        var loserPitcher = box.loser.id === result.home.id ? result.homePitcher : result.awayPitcher;
        return '<div class="box-score-decisions"><span><strong>W</strong> ' + escapeHtml(winnerPitcher && winnerPitcher.name || 'Simulated starter') + '</span><span><strong>L</strong> ' + escapeHtml(loserPitcher && loserPitcher.name || 'Simulated starter') + '</span><span><strong>SV</strong> Simulated bullpen line</span></div>';
    }
    function teamScoreBlock(line, side) {
        return '<div class="box-score-team-card ' + side + '">' + logoMarkup(line.team, 'scoreboard-logo') + '<div><strong>' + escapeHtml(line.team.abbreviation) + '</strong><span>' + escapeHtml(line.team.name) + '</span><small>' + escapeHtml(line.team.era === 'historical' ? 'Classic ' + line.team.season : line.team.league + ' ' + line.team.division) + '</small></div></div>';
    }
    function renderScoreboardCard(result, box) {
        return '<div class="box-score-status">FINAL</div><div class="box-score-matchup-main">' + teamScoreBlock(box.away, 'away') +
            '<div class="box-score-final"><span>' + escapeHtml(result.away.abbreviation) + '</span><strong>' + box.away.runs + '<em>-</em>' + box.home.runs + '</strong><span>' + escapeHtml(result.home.abbreviation) + '</span></div>' +
            teamScoreBlock(box.home, 'home') + '</div>' + pitcherDecisionLine(result, box) +
            '<p class="box-score-honesty">Simulation output from TrustMyRecord. Player stat lines are modeled from the selected matchup and are not official MLB stats.</p>';
    }
    function summaryLine(line) {
        var stats = line.summaryStats || {};
        return line.team.abbreviation + ': 2B ' + (stats.doubles || 0) + ', 3B ' + (stats.triples || 0) + ', HR ' + (stats.homeRuns || 0) + ', RBI ' + (stats.rbi || 0) + ', BB ' + (stats.walks || 0) + ', SO ' + (stats.strikeouts || 0) + ', SB ' + (stats.stolenBases || 0) + ', CS ' + (stats.caughtStealing || 0) + ', LOB ' + (stats.leftOnBase || 0) + ', Pitches ' + (stats.totalPitches || 0) + ' (' + (stats.totalPitches || 0) + '-' + (stats.totalStrikes || 0) + ' P-S)';
    }
    function summaryMarkup() {
        return '<p>Simulation output only. These modeled batter and pitcher lines are not official MLB stats or official game results.</p>';
    }
    function teamBattingTable(team, players) {
        var source = players && players.rosterSource ? players.rosterSource : 'Roster temporarily unavailable';
        var hasBatters = players && players.batters && players.batters.length;
        if (!hasBatters) {
            return '<section class="box-score-stat-team"><h5>' + escapeHtml(team.name) + '</h5><p class="player-source-note">' + escapeHtml(source) + '; stat lines are simulation output, not official MLB stats.</p><div class="sim-empty">Lineup unavailable. Verified roster data could not be loaded.</div></section>';
        }
        return '<section class="box-score-stat-team"><h5>' + escapeHtml(team.name) + '</h5><p class="player-source-note">' + escapeHtml(source) + '; stat lines are simulation output, not official MLB stats.</p>' +
            '<div class="player-table-wrap"><table class="player-box-table batting-table"><thead><tr><th>Hitters</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>K</th><th>AVG</th><th>OPS</th></tr></thead><tbody>' + batterTableRows(players.batters) + '</tbody></table></div></section>';
    }
    function pitcherDecisionsForTeam(team, players, result) {
        var rows = players && players.pitchers || [];
        var decisions = {};
        if (!rows.length || !result || !result.boxScore) return decisions;
        var box = result.boxScore;
        if (box.winner && box.winner.id === team.id) {
            decisions[rows[0].name] = 'W';
            if (rows.length > 1) decisions[rows[rows.length - 1].name] = 'SV';
        } else if (box.loser && box.loser.id === team.id) {
            decisions[rows[0].name] = 'L';
        }
        return decisions;
    }
    function teamPitchingTable(team, players, result) {
        var source = players && players.rosterSource ? players.rosterSource : 'Roster temporarily unavailable';
        var hasPitchers = players && players.pitchers && players.pitchers.length;
        if (!hasPitchers) {
            return '<section class="box-score-stat-team"><h5>' + escapeHtml(team.name) + '</h5><p class="player-source-note">' + escapeHtml(source) + '; stat lines are simulation output, not official MLB stats.</p><div class="sim-empty">Lineup unavailable. Verified roster data could not be loaded.</div></section>';
        }
        return '<section class="box-score-stat-team"><h5>' + escapeHtml(team.name) + '</h5><p class="player-source-note">' + escapeHtml(source) + '; stat lines are simulation output, not official MLB stats.</p>' +
            '<div class="player-table-wrap"><table class="player-box-table pitching-table"><thead><tr><th>Pitchers</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>K</th><th>HR</th><th>ERA</th></tr></thead><tbody>' + pitcherTableRows(players.pitchers, pitcherDecisionsForTeam(team, players, result)) + '</tbody></table></div></section>';
    }
    function statPlayerNames(rows, key) {
        return (rows || []).filter(function (row) { return Number(row && row[key] || 0) > 0; }).map(function (row) {
            var value = Number(row[key] || 0);
            return row.name + (value > 1 ? ' ' + value : '');
        }).join(', ');
    }
    function totalBases(rows) {
        return (rows || []).reduce(function (total, row) {
            var doubles = Number(row.doubles || 0);
            var triples = Number(row.triples || 0);
            var homers = Number(row.hr || 0);
            var singles = Math.max(0, Number(row.h || 0) - doubles - triples - homers);
            return total + singles + doubles * 2 + triples * 3 + homers * 4;
        }, 0);
    }
    function teamRisp(line, players) {
        var stats = line.summaryStats || {};
        var batters = players && players.batters || [];
        var hitsWithRisp = clamp(Math.round((stats.rbi || 0) * 0.45 + (stats.homeRuns || 0) * 0.25), 0, Math.max(0, line.hits || 0));
        var chances = clamp(hitsWithRisp + Math.max(1, Math.round((stats.leftOnBase || 0) * 0.42 + (stats.rbi || 0) * 0.35)), hitsWithRisp, Math.max(hitsWithRisp, playerSum(batters, 'ab')));
        return hitsWithRisp + '-for-' + chances;
    }
    function playerDetail(label, value) {
        return '<p><strong>' + escapeHtml(label) + '</strong> ' + escapeHtml(value != null && value !== '' ? value : 'None') + '</p>';
    }
    function battingDetailBlock(line, players) {
        var stats = line.summaryStats || {};
        var batters = players && players.batters || [];
        var doubles = statPlayerNames(batters, 'doubles');
        var triples = statPlayerNames(batters, 'triples');
        var homers = statPlayerNames(batters, 'hr');
        var rbiNames = statPlayerNames(batters, 'rbi');
        var sbNames = statPlayerNames(batters, 'sb');
        var csNames = statPlayerNames(batters, 'cs');
        var derivedTwoOutRbi = clamp(Math.round((stats.rbi || 0) * 0.32), 0, stats.rbi || 0);
        var derivedRispsTwoOut = clamp(Math.round((stats.leftOnBase || 0) * 0.28), 0, stats.leftOnBase || 0);
        var derivedGidp = clamp(Math.round(((stats.leftOnBase || 0) + (stats.walks || 0)) / 9), 0, 3);
        var derivedDp = clamp(Math.round(((line.hits || 0) + (stats.walks || 0)) / 11), 0, 3);
        return '<section class="box-score-team-details"><h5>' + escapeHtml(line.team.abbreviation) + ' Details</h5><div class="box-score-detail-group"><h6>Batting</h6>' +
            playerDetail('2B:', doubles || 'None') +
            playerDetail('3B:', triples || 'None') +
            playerDetail('HR:', homers || 'None') +
            playerDetail('TB:', totalBases(batters)) +
            playerDetail('RBI:', rbiNames || (stats.rbi || 0)) +
            playerDetail('2-out RBI:', derivedTwoOutRbi + ' simulated') +
            playerDetail('Runners left in scoring position, 2 out:', derivedRispsTwoOut + ' simulated') +
            playerDetail('GIDP:', derivedGidp + ' simulated') +
            playerDetail('Team RISP:', teamRisp(line, players) + ' simulated') +
            playerDetail('Team LOB:', stats.leftOnBase || 0) + '</div><div class="box-score-detail-group"><h6>Baserunning</h6>' +
            playerDetail('SB:', sbNames || (stats.stolenBases || 0)) +
            playerDetail('CS:', csNames || (stats.caughtStealing || 0)) +
            playerDetail('Pickoffs:', '0 simulated') + '</div><div class="box-score-detail-group"><h6>Fielding</h6>' +
            playerDetail('E:', line.errors ? line.errors + ' simulated team error' + (line.errors > 1 ? 's' : '') : 'None') +
            playerDetail('Outfield assists:', '0 simulated') +
            playerDetail('DP:', derivedDp + ' simulated') + '</div></section>';
    }
    function battingDetailsSection(result) {
        var box = result.boxScore;
        return '<section class="box-score-detail-section batting-detail-section"><h4>Batting, Baserunning & Fielding</h4><div class="box-score-stat-grid">' +
            battingDetailBlock(box.away, box.players.away) + battingDetailBlock(box.home, box.players.home) + '</div></section>';
    }
    function pitcherGameNoteBlock(line, players) {
        var stats = line.summaryStats || {};
        var pitchers = players && players.pitchers || [];
        var outs = playerSum(pitchers, 'outs');
        var strikeouts = playerSum(pitchers, 'so');
        var groundouts = Math.max(0, Math.round((outs - strikeouts) * 0.56));
        var flyouts = Math.max(0, outs - strikeouts - groundouts);
        var battersFaced = outs + playerSum(pitchers, 'h') + playerSum(pitchers, 'bb');
        var inherited = Math.max(0, pitchers.length - 1);
        var inheritedScored = clamp(Math.round(playerSum(pitchers.slice(1), 'r') * 0.45), 0, inherited + 2);
        return '<section class="box-score-team-details"><h5>' + escapeHtml(line.team.abbreviation) + ' Pitching Notes</h5><div class="box-score-detail-group">' +
            playerDetail('Pitches-strikes:', (stats.totalPitches || 0) + '-' + (stats.totalStrikes || 0)) +
            playerDetail('Groundouts-flyouts:', groundouts + '-' + flyouts) +
            playerDetail('Batters faced:', battersFaced) +
            playerDetail('Inherited runners-scored:', inherited + '-' + inheritedScored) + '</div></section>';
    }
    function gameNotesSection(result) {
        var box = result.boxScore;
        return '<section class="box-score-detail-section game-note-section"><h4>Pitching & Game Notes</h4><div class="box-score-stat-grid">' +
            pitcherGameNoteBlock(box.away, box.players.away) + pitcherGameNoteBlock(box.home, box.players.home) +
            '</div></section>';
    }
    function statSection(title, content) {
        return '<section class="box-score-stat-section"><h4>' + escapeHtml(title) + '</h4><div class="box-score-stat-grid">' + content + '</div></section>';
    }
    function renderPlayerBoxScore(result) {
        var panel = byId('playerBoxScorePanel');
        var content = byId('playerBoxScoreContent');
        if (!panel || !content) return;
        if (!result || !result.boxScore || !result.boxScore.players) {
            panel.setAttribute('data-player-box-state', 'empty');
            content.innerHTML = '<div class="sim-empty">Run a simulation to generate batter and pitcher simulation lines.</div>';
            return;
        }
        panel.setAttribute('data-player-box-state', 'projected');
        content.innerHTML = statSection('Batting', teamBattingTable(result.away, result.boxScore.players.away) + teamBattingTable(result.home, result.boxScore.players.home)) +
            battingDetailsSection(result) +
            statSection('Pitching', teamPitchingTable(result.away, result.boxScore.players.away, result) + teamPitchingTable(result.home, result.boxScore.players.home, result)) +
            gameNotesSection(result);
    }
    function boxScoreText(result) {
        if (!result || !result.boxScore) return '';
        var box = result.boxScore;
        var generatedAt = new Date().toISOString();
        var lines = [];
        lines.push('TrustMyRecord MLB Simulator Box Score');
        lines.push('Generated: ' + generatedAt);
        lines.push(result.away.name + ' at ' + result.home.name);
        lines.push('Mode: ' + result.simulationMode + ' / Data: ' + result.dataMode);
        lines.push('Simulated final: ' + result.away.name + ' ' + box.away.runs + ', ' + result.home.name + ' ' + box.home.runs);
        lines.push('Win probability: ' + result.away.name + ' ' + roundPct(result.awayWin) + ' / ' + result.home.name + ' ' + roundPct(result.homeWin));
        lines.push('Expected runs: ' + result.away.name + ' ' + result.awayRuns + ' / ' + result.home.name + ' ' + result.homeRuns);
        lines.push('Starting Pitchers: ' + result.away.name + ': ' + (result.awayPitcher ? result.awayPitcher.name : 'Roster temporarily unavailable') + ' | ' + result.home.name + ': ' + (result.homePitcher ? result.homePitcher.name : 'Roster temporarily unavailable'));
        lines.push('');
        lines.push('Team        1 2 3 4 5 6 7 8 9 | R H E');
        [box.away, box.home].forEach(function (line) {
            lines.push((line.team.abbreviation + '          ').slice(0, 10) + line.innings.join(' ') + ' | ' + line.runs + ' ' + line.hits + ' ' + line.errors);
        });
        lines.push('');
        lines.push('Final: ' + box.winner.name + ' ' + Math.max(box.away.runs, box.home.runs) + ', ' + box.loser.name + ' ' + Math.min(box.away.runs, box.home.runs));
        lines.push(box.summary);
        lines.push('Team summary: ' + summaryLine(box.away) + ' / ' + summaryLine(box.home));
        lines.push('Pitcher lines: ' + box.pitcherLines.join(' / '));
        lines.push('Key performers: ' + box.keyPerformers.join(' / '));
        if (box.players) {
            lines.push('');
            lines.push('Player Box Score');
            [
                [result.away.name, box.players.away],
                [result.home.name, box.players.home]
            ].forEach(function (group) {
                lines.push(group[0] + ' batters - ' + (group[1].rosterSource || 'Roster temporarily unavailable'));
                lines.push('Batter, AB, R, H, 2B, 3B, HR, RBI, BB, SO, SB, CS');
                group[1].batters.forEach(function (row) {
                    lines.push([row.name, row.ab, row.r, row.h, row.doubles || 0, row.triples || 0, row.hr || 0, row.rbi, row.bb, row.so, row.sb || 0, row.cs || 0].join(', '));
                });
                lines.push(group[0] + ' pitchers');
                lines.push('Pitcher, IP, H, R, ER, BB, SO, HR, NP, P-S');
                group[1].pitchers.forEach(function (row) {
                    lines.push([row.name, row.ip, row.h, row.r, row.er, row.bb, row.so, row.hr, row.pitches || 0, row.ps || ((row.pitches || 0) + '-' + (row.strikes || 0))].join(', '));
                });
            });
        }
        lines.push('Matchup notes: ' + result.keyExplanation);
        lines.push('Projection notice: Simulation-based estimate, not sportsbook odds or a guaranteed result.');
        return lines.join('\n');
    }
    function boxScoreFilename(result) {
        var away = slugify(result.away.name);
        var home = slugify(result.home.name);
        var stamp = new Date().toISOString().slice(0, 10);
        return 'trustmyrecord-mlb-simulator-box-score-' + away + '-vs-' + home + '-' + stamp + '.txt';
    }
    function setExportButtons(enabled) {
        var copy = byId('copyBoxScoreButton');
        var save = byId('saveBoxScoreButton');
        var view = byId('viewBoxScoreLink');
        var viewControl = byId('viewBoxScoreControl');
        var viewLabel = state.aggregate && state.aggregate.count > 1 ? 'View Summary & Box Score' : 'View Box Score';
        if (copy) copy.disabled = !enabled;
        if (save) save.disabled = !enabled;
        if (view) {
            view.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            view.textContent = viewLabel;
        }
        if (viewControl) {
            viewControl.setAttribute('aria-disabled', enabled ? 'false' : 'true');
            viewControl.textContent = viewLabel;
        }
    }
    function selectedSimulationCount() {
        var select = byId('simulationCountSelect');
        var value = select ? Number(select.value) : 1;
        return [1, 10, 25, 50, 100].indexOf(value) !== -1 ? value : 1;
    }
    function buildAggregate(results, away, home) {
        var count = results.length;
        var awayWins = results.filter(function (result) { return result.boxScore && result.boxScore.winner.id === away.id; }).length;
        var homeWins = count - awayWins;
        var awayRuns = sum(results.map(function (result) { return result.boxScore ? result.boxScore.away.runs : 0; }));
        var homeRuns = sum(results.map(function (result) { return result.boxScore ? result.boxScore.home.runs : 0; }));
        var commonWinner = awayWins >= homeWins ? away : home;
        return {
            count: count,
            away: away,
            home: home,
            awayWins: awayWins,
            homeWins: homeWins,
            awayWinPct: awayWins / count,
            homeWinPct: homeWins / count,
            awayAverageScore: round1(awayRuns / count),
            homeAverageScore: round1(homeRuns / count),
            commonWinner: commonWinner,
            summary: count + ' simulation runs produced ' + away.name + ' ' + awayWins + ' wins and ' + home.name + ' ' + homeWins + ' wins. Most common simulated winner: ' + commonWinner.name + '.'
        };
    }
    function renderAggregate(aggregate) {
        var panel = byId('aggregatePanel');
        var grid = byId('aggregateSummaryGrid');
        var summary = byId('aggregateSummaryText');
        if (!panel || !grid || !summary) return;
        if (!aggregate || aggregate.count <= 1) {
            panel.setAttribute('data-aggregate-state', 'empty');
            grid.innerHTML = '<div><strong>Runs</strong><span>Choose 10, 25, 50, or 100 simulations.</span></div>';
            summary.textContent = 'Multiple-simulation output is simulation-based, not official prediction certainty.';
            return;
        }
        panel.setAttribute('data-aggregate-state', 'projected');
        var rows = [
            ['Simulations Run', aggregate.count],
            [aggregate.away.abbreviation + ' Wins', aggregate.awayWins + ' (' + roundPct(aggregate.awayWinPct) + ')'],
            [aggregate.home.abbreviation + ' Wins', aggregate.homeWins + ' (' + roundPct(aggregate.homeWinPct) + ')'],
            ['Average Score', aggregate.away.abbreviation + ' ' + aggregate.awayAverageScore + ' / ' + aggregate.home.abbreviation + ' ' + aggregate.homeAverageScore],
            ['Most Common Winner', aggregate.commonWinner.name],
            ['Output Type', 'Simulation-based estimate']
        ];
        grid.innerHTML = rows.map(function (row) {
            return '<div><strong>' + escapeHtml(row[0]) + '</strong><span>' + escapeHtml(row[1]) + '</span></div>';
        }).join('');
        summary.textContent = aggregate.summary + ' This is simulation output, not official prediction certainty.';
    }
    function renderBoxScore(result) {
        var panel = byId('boxScorePanel');
        var title = byId('boxScoreTitle');
        var body = byId('boxScoreBody');
        var matchup = byId('boxScoreMatchupCard');
        if (!panel || !title || !body) return;
        if (!result || !result.boxScore) {
            panel.setAttribute('data-box-score-state', 'empty');
            title.textContent = 'Run a simulation to generate a box score.';
            body.innerHTML = '<tr><td colspan="13">Run a simulation to generate a box score.</td></tr>';
            if (matchup) matchup.innerHTML = '<div class="sim-empty">Run a simulation to generate a game summary card.</div>';
            setExportButtons(false);
            renderPlayerBoxScore(null);
            return;
        }
        var box = result.boxScore;
        panel.setAttribute('data-box-score-state', 'projected');
        title.textContent = result.away.name + ' at ' + result.home.name;
        if (matchup) matchup.innerHTML = renderScoreboardCard(result, box);
        body.innerHTML = boxRow(box.away, box.winner.id) + boxRow(box.home, box.winner.id);
        renderPlayerBoxScore(result);
        setExportButtons(true);
    }

    function renderResult(result) {
        if (!result) {
            var shell = byId('projectionShell');
            if (shell) shell.setAttribute('data-projection-state', 'not-connected');
            var emptyState = byId('projectionEmptyState');
            if (emptyState) emptyState.setAttribute('data-empty-state', 'ready');
            var probabilityLab = byId('probabilityLab');
            if (probabilityLab) probabilityLab.setAttribute('data-probability-state', 'empty');
            setText('projectedScoreValue', 'Run simulation');
            setText('winProbabilityValue', 'Select teams');
            setText('expectedRunsValue', 'Choose starters');
            setText('totalRangeValue', 'Run to calculate');
            setText('runEnvironmentValue', 'Run to calculate');
            setText('simulationConfidenceValue', 'Run to calculate');
            setText('eraAdjustmentValue', 'Run to calculate');
            setText('simulationModeValue', 'Ready to run');
            setText('dataModeValue', dataModeLabel());
            setText('awayProbabilityLabel', 'Team A');
            setText('homeProbabilityLabel', 'Team B');
            setText('awayProbabilityValue', '--');
            setText('homeProbabilityValue', '--');
            setText('winnerBadge', 'Run a simulation');
            setText('awayScoreLabel', 'Team A');
            setText('homeScoreLabel', 'Team B');
            setText('awayScoreBig', '--');
            setText('homeScoreBig', '--');
            setText('awayExpectedTile', 'Starter selected above');
            setText('homeExpectedTile', 'Starter selected above');
            setText('keyExplanationValue', 'Select two teams, choose starting pitchers, then run the simulator to generate projected score, win probability, expected runs, confidence band, and full box score.');
            var emptyCard = byId('resultCard');
            if (emptyCard) emptyCard.setAttribute('data-result-state', 'empty');
            setText('projectionNotice', 'Simulation-based estimate mode is ready. Select two teams and click Run Simulation.');
            renderComparison(null);
            renderInputStatus(null);
            renderNotes(null);
            renderAggregate(null);
            renderBoxScore(null);
            return;
        }
        var shellProjected = byId('projectionShell');
        if (shellProjected) shellProjected.setAttribute('data-projection-state', 'projected');
        var emptyProjected = byId('projectionEmptyState');
        if (emptyProjected) emptyProjected.setAttribute('data-empty-state', 'hidden');
        var probabilityProjected = byId('probabilityLab');
        if (probabilityProjected) probabilityProjected.setAttribute('data-probability-state', 'projected');
        var resultCard = byId('resultCard');
        if (resultCard) resultCard.setAttribute('data-result-state', 'projected');
        setText('winnerBadge', result.winner.name + ' ' + roundPct(result.winnerPct));
        setText('awayScoreLabel', result.away.name);
        setText('homeScoreLabel', result.home.name);
        setText('awayScoreBig', result.projectedAwayScore);
        setText('homeScoreBig', result.projectedHomeScore);
        setText('awayExpectedTile', 'Expected runs ' + result.awayRuns);
        setText('homeExpectedTile', 'Expected runs ' + result.homeRuns);
        setText('keyExplanationValue', result.keyExplanation);
        setText('projectedScoreValue', result.away.abbreviation + ' ' + result.awayRange[0] + '-' + result.awayRange[1] + ' / ' + result.home.abbreviation + ' ' + result.homeRange[0] + '-' + result.homeRange[1]);
        setText('winProbabilityValue', result.winner.abbreviation + ' ' + roundPct(result.winnerPct));
        setText('expectedRunsValue', result.away.abbreviation + ' ' + result.awayRuns + ' / ' + result.home.abbreviation + ' ' + result.homeRuns);
        setText('totalRangeValue', result.totalRange[0] + '-' + result.totalRange[1]);
        setText('runEnvironmentValue', result.runEnvironment);
        setText('simulationConfidenceValue', result.confidenceBand);
        setText('eraAdjustmentValue', result.eraAdjustment);
        setText('simulationModeValue', result.simulationMode);
        setText('dataModeValue', result.dataMode);
        setText('awayProbabilityLabel', result.away.name);
        setText('homeProbabilityLabel', result.home.name);
        setText('awayProbabilityValue', roundPct(result.awayWin));
        setText('homeProbabilityValue', roundPct(result.homeWin));
        var awayBar = byId('awayProbabilityBar');
        var homeBar = byId('homeProbabilityBar');
        if (awayBar) awayBar.style.width = clamp(result.awayWin * 100, 2, 98) + '%';
        if (homeBar) homeBar.style.width = clamp(result.homeWin * 100, 2, 98) + '%';
        setText('projectionNotice', state.aggregate && state.aggregate.count > 1 ? 'Aggregate summary is based on ' + state.aggregate.count + ' simulation runs. Latest Simulated Box Score is shown below for copy/save.' : (result.dataSourcesUsed.length ? 'Verified live inputs are included where listed. No SportsDataIO data, betting edge, or official record is created.' : 'Simulation-based estimate, not sportsbook odds or provider projection. No SportsDataIO data, betting edge, or official record is created.'));
        renderComparison(result);
        renderInputStatus(result);
        renderNotes(result);
        renderAggregate(state.aggregate);
        renderBoxScore(result);
    }

    function renderLoading(away, home) {
        var shell = byId('projectionShell');
        var resultCard = byId('resultCard');
        if (shell) shell.setAttribute('data-projection-state', 'loading');
        var emptyState = byId('projectionEmptyState');
        if (emptyState) emptyState.setAttribute('data-empty-state', 'hidden');
        var probabilityLab = byId('probabilityLab');
        if (probabilityLab) probabilityLab.setAttribute('data-probability-state', 'empty');
        if (resultCard) resultCard.setAttribute('data-result-state', 'loading');
        setText('winnerBadge', 'Running baseline sim...');
        setText('awayScoreLabel', away ? away.name : 'Team A');
        setText('homeScoreLabel', home ? home.name : 'Team B');
        setText('keyExplanationValue', 'Calculating internal baseline ratings, run environment, era context, and matchup strength.');
        setText('projectionNotice', 'Running simulation from internal baseline team ratings. No live odds, injuries, weather, or starters are being loaded.');
        renderDataModeStatus();
    }

    function switchMode(mode) {
        state.preset = mode === 'historical' || mode === 'mixed' ? mode : 'current';
        if (state.preset === 'historical') {
            state.awayPool = 'historical';
            state.homePool = 'historical';
        } else if (state.preset === 'mixed') {
            state.awayPool = 'current';
            state.homePool = 'historical';
        } else {
            state.awayPool = 'current';
            state.homePool = 'current';
        }
        state.awayTeamId = poolTeams(state.awayPool)[0].id;
        state.homeTeamId = poolTeams(state.homePool)[1] ? poolTeams(state.homePool)[1].id : poolTeams(state.homePool)[0].id;
        state.awayPitcherId = '';
        state.homePitcherId = '';
        state.awayPitcherTouched = false;
        state.homePitcherTouched = false;
        state.simulation = null;
        state.aggregate = null;
        renderSelectors();
        renderResult(null);
    }

    function runSimulation() {
        var away = findTeamInPool(state.awayTeamId, state.awayPool);
        var home = findTeamInPool(state.homeTeamId, state.homePool);
        if (!away || !home || away.id === home.id) {
            setText('projectionNotice', 'Select two different teams to run a simulation. No output was generated.');
            return Promise.resolve(null);
        }
        renderLoading(away, home);
        setLiveInputsForMatchup(away, home);
        setText('projectionNotice', 'Loading verified MLB active roster names before rendering the player box score.');
        return ensureRostersForTeams(away, home).then(function () {
            setLiveInputsForMatchup(away, home);
            renderPitcherOptions('away', away, state.activeLiveContext);
            renderPitcherOptions('home', home, state.activeLiveContext);
            state.simulationCount = selectedSimulationCount();
            var count = state.simulationCount;
            var stamp = Date.now();
            var results = [];
            for (var i = 0; i < count; i += 1) {
                results.push(simulate(away, home, state.activeLiveContext, count === 1 ? 'single-' + stamp : 'batch-' + stamp + '-' + i, count > 1));
            }
            state.aggregate = count > 1 ? buildAggregate(results, away, home) : null;
            state.simulation = results[results.length - 1];
            renderResult(state.simulation);
            return state.simulation;
        });
    }
    function copyBoxScore() {
        if (!state.simulation) return;
        var text = boxScoreText(state.simulation);
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                setText('projectionNotice', 'Box score copied to clipboard.');
            }).catch(function () {
                setText('projectionNotice', 'Copy failed in this browser. Save Box Score is still available.');
            });
        } else {
            setText('projectionNotice', 'Clipboard copy is unavailable in this browser. Save Box Score is still available.');
        }
    }
    function saveBoxScore() {
        if (!state.simulation) return;
        var text = boxScoreText(state.simulation);
        var filename = boxScoreFilename(state.simulation);
        if (typeof Blob === 'undefined' || typeof window === 'undefined' || !window.URL || !document.createElement || !document.body) {
            setText('projectionNotice', 'File save is unavailable in this browser.');
            return;
        }
        var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        var url = window.URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setText('projectionNotice', 'Box score saved as ' + filename + '.');
    }
    function viewBoxScore(event) {
        if (event && event.preventDefault) event.preventDefault();
        if (!state.simulation) {
            setText('projectionNotice', 'Run a simulation first. The box score appears automatically after a completed simulation.');
            return;
        }
        var panel = state.aggregate && state.aggregate.count > 1 ? byId('aggregatePanel') : byId('boxScorePanel');
        if (!panel) return;
        if (typeof panel.scrollIntoView === 'function') {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (typeof window !== 'undefined') {
            window.location.hash = 'boxScorePanel';
        }
    }

    function normalizeBoardResponse(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.games)) return data.games;
        return [];
    }

    function loadLiveContext() {
        state.liveContext.status = 'loading';
        renderDataModeStatus();
        var base = apiBaseUrl();
        var espnUrls = recentEspnDates().map(function (date) {
            return 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=' + date;
        });
        return Promise.allSettled([
            fetchJson(base + '/games?sport=baseball_mlb'),
            fetchJson(base + '/games/board/baseball_mlb')
        ].concat(espnUrls.map(fetchJson))).then(function (results) {
            var schedule = results[0].status === 'fulfilled' && results[0].value && Array.isArray(results[0].value.games) ? results[0].value.games : [];
            var board = results[1].status === 'fulfilled' ? normalizeBoardResponse(results[1].value) : [];
            var espnEventsByDate = results.slice(2).map(function (result) {
                return result.status === 'fulfilled' && result.value && Array.isArray(result.value.events) ? result.value.events.map(extractEspnEvent).filter(Boolean) : [];
            });
            var espnEvents = espnEventsByDate[0] || [];
            var recentEvents = espnEventsByDate.reduce(function (all, events) { return all.concat(events); }, []).filter(function (event) { return event && event.completed; });
            var summaryRequests = espnEvents.slice(0, 20).filter(function (event) { return event && event.id; }).map(function (event) {
                return fetchJson('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=' + encodeURIComponent(event.id)).then(function (summary) {
                    return { id: event.id, summary: summary };
                });
            });
            return Promise.allSettled(summaryRequests).then(function (summaryResults) {
                var summaries = {};
                summaryResults.forEach(function (result) {
                    if (result.status === 'fulfilled' && result.value && result.value.id) summaries[result.value.id] = result.value.summary;
                });
                state.liveContext = {
                    status: schedule.length || board.length || espnEvents.length ? 'available' : 'unavailable',
                    loadedAt: new Date().toISOString(),
                    scheduleGames: schedule,
                    boardGames: board,
                    espnEvents: espnEvents,
                    espnSummaries: summaries,
                    teamRosters: state.liveContext.teamRosters || {},
                    recentEvents: recentEvents,
                    error: null
                };
                renderSelectors();
                if (state.simulation) {
                    var away = findTeamInPool(state.awayTeamId, state.awayPool);
                    var home = findTeamInPool(state.homeTeamId, state.homePool);
                    var count = state.simulationCount || 1;
                    var stamp = Date.now();
                    var results = [];
                    for (var i = 0; i < count; i += 1) {
                        results.push(simulate(away, home, state.activeLiveContext, count === 1 ? 'single-' + stamp : 'batch-' + stamp + '-' + i, count > 1));
                    }
                    state.aggregate = count > 1 ? buildAggregate(results, away, home) : null;
                    state.simulation = results[results.length - 1];
                    renderResult(state.simulation);
                }
            });
        }).catch(function (error) {
            state.liveContext.status = 'unavailable';
            state.liveContext.error = error && error.message || 'Live context unavailable';
            renderSelectors();
        });
    }

    function wireEvents() {
        var away = byId('awayTeamSelect');
        var home = byId('homeTeamSelect');
        var awayPool = byId('awayPoolSelect');
        var homePool = byId('homePoolSelect');
        var awayPitcherSelect = byId('awayPitcherSelect');
        var homePitcherSelect = byId('homePitcherSelect');
        var run = byId('runSimulationButton');
        var simulationCountSelect = byId('simulationCountSelect');
        var refresh = byId('refreshTeamsButton');
        var copyBox = byId('copyBoxScoreButton');
        var saveBox = byId('saveBoxScoreButton');
        var viewBox = byId('viewBoxScoreLink');
        var viewBoxControl = byId('viewBoxScoreControl');
        var current = byId('currentModeButton');
        var historical = byId('historicalModeButton');
        var mixed = byId('mixedModeButton');
        if (awayPool) awayPool.addEventListener('change', function () { state.awayPool = awayPool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.awayTeamId = poolTeams(state.awayPool)[0].id; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (homePool) homePool.addEventListener('change', function () { state.homePool = homePool.value === 'historical' ? 'historical' : 'current'; state.preset = 'custom'; state.homeTeamId = poolTeams(state.homePool)[0].id; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (away) away.addEventListener('change', function () { state.awayTeamId = away.value; state.awayPitcherId = ''; state.awayPitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (home) home.addEventListener('change', function () { state.homeTeamId = home.value; state.homePitcherId = ''; state.homePitcherTouched = false; state.simulation = null; state.aggregate = null; renderSelectors(); renderResult(null); });
        if (awayPitcherSelect) awayPitcherSelect.addEventListener('change', function () {
            state.awayPitcherId = awayPitcherSelect.value;
            state.awayPitcherTouched = true;
            state.simulation = null;
            state.aggregate = null;
            renderPitcherOptions('away', findTeamInPool(state.awayTeamId, state.awayPool), state.activeLiveContext);
            renderResult(null);
        });
        if (homePitcherSelect) homePitcherSelect.addEventListener('change', function () {
            state.homePitcherId = homePitcherSelect.value;
            state.homePitcherTouched = true;
            state.simulation = null;
            state.aggregate = null;
            renderPitcherOptions('home', findTeamInPool(state.homeTeamId, state.homePool), state.activeLiveContext);
            renderResult(null);
        });
        if (run) run.addEventListener('click', runSimulation);
        if (simulationCountSelect) simulationCountSelect.addEventListener('change', function () { state.simulationCount = selectedSimulationCount(); });
        if (copyBox) copyBox.addEventListener('click', copyBoxScore);
        if (saveBox) saveBox.addEventListener('click', saveBoxScore);
        if (viewBox) viewBox.addEventListener('click', viewBoxScore);
        if (viewBoxControl) viewBoxControl.addEventListener('click', viewBoxScore);
        if (refresh) refresh.addEventListener('click', function () { switchMode('current'); });
        if (current) current.addEventListener('click', function () { switchMode('current'); });
        if (historical) historical.addEventListener('click', function () { switchMode('historical'); });
        if (mixed) mixed.addEventListener('click', function () { switchMode('mixed'); });
    }

    function init() {
        wireEvents();
        renderSelectors();
        renderResult(null);
        loadLiveContext();
        if (typeof window !== 'undefined' && window.location && /[?&]tmrAutoRun=ari-atl\b/.test(window.location.search || '')) {
            setTimeout(function () {
                state.awayPool = 'current';
                state.homePool = 'current';
                state.awayTeamId = 'current-ari';
                state.homeTeamId = 'current-atl';
                state.awayPitcherId = '';
                state.homePitcherId = '';
                renderSelectors();
                runSimulation();
            }, 350);
        }
    }

    window.TMRMlbSimulator = {
        uiBuild: UI_BUILD,
        state: state,
        localTeams: LOCAL_TEAMS,
        liveInputs: LIVE_INPUT_SOURCES,
        loadLiveContext: loadLiveContext,
        selectedLiveContext: selectedLiveContext,
        pitcherOptionsFor: pitcherOptionsFor,
        runSimulation: runSimulation,
        simulate: simulate,
        boxScoreText: boxScoreText,
        copyBoxScore: copyBoxScore,
        saveBoxScore: saveBoxScore,
        viewBoxScore: viewBoxScore,
        rosterSourceForTeam: rosterSourceForTeam,
        fetchTeamRoster: fetchTeamRoster,
        validatedRosterForTeam: validatedRosterForTeam
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
