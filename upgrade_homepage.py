import re

with open('C:/Users/Nima/trustmyrecord/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Replace hero CSS - bigger glow, animated gradient text, colorful shimmer line
old_hero = """        /* Hero Section */
        .hero {
            text-align: center;
            padding: 80px 20px 60px;
            position: relative;
            overflow: hidden;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                radial-gradient(ellipse 600px 400px at 50% 30%, rgba(0, 255, 255, 0.08) 0%, transparent 70%),
                radial-gradient(ellipse 300px 300px at 20% 80%, rgba(245, 158, 11, 0.05) 0%, transparent 70%),
                radial-gradient(ellipse 300px 300px at 80% 80%, rgba(14, 165, 233, 0.05) 0%, transparent 70%);
            pointer-events: none;
        }

        .hero::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 10%;
            right: 10%;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.4), rgba(245, 158, 11, 0.3), rgba(0, 255, 255, 0.4), transparent);
        }

        .hero h1 {
            font-family: 'Orbitron', monospace;
            font-size: clamp(2.5rem, 6vw, 4rem);
            font-weight: 900;
            margin-bottom: 20px;
            color: #00ffff;
            line-height: 1.1;
            letter-spacing: 2px;
            text-transform: uppercase;
            text-shadow: 0 0 10px rgba(0, 255, 255, 0.3), 0 0 30px rgba(0, 255, 255, 0.1);
            position: relative;
            z-index: 1;
            animation: neon-flash 3s ease-in-out infinite alternate;
        }

        @keyframes neon-flash {
            0% {
                text-shadow:
                    0 0 5px rgba(0, 255, 255, 0.4),
                    0 0 10px rgba(0, 255, 255, 0.2),
                    0 0 20px rgba(0, 255, 255, 0.1);
            }
            100% {
                text-shadow:
                    0 0 10px rgba(0, 255, 255, 0.6),
                    0 0 20px rgba(0, 255, 255, 0.3),
                    0 0 40px rgba(0, 255, 255, 0.15),
                    0 0 60px rgba(0, 255, 255, 0.05);
            }
        }"""

new_hero = """        /* Hero Section */
        .hero {
            text-align: center;
            padding: 90px 20px 70px;
            position: relative;
            overflow: hidden;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background:
                radial-gradient(ellipse at 30% 20%, rgba(0, 255, 255, 0.18) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 80%, rgba(245, 158, 11, 0.12) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.08) 0%, transparent 60%);
            animation: heroGlow 8s ease-in-out infinite alternate;
            pointer-events: none;
        }

        @keyframes heroGlow {
            0% { transform: translate(0, 0) scale(1); opacity: 0.7; }
            100% { transform: translate(-2%, -2%) scale(1.05); opacity: 1; }
        }

        .hero::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, #00ffff, #f59e0b, #8b5cf6, #00ffff, transparent);
            animation: shimmerLine 4s ease-in-out infinite;
        }

        @keyframes shimmerLine {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
        }

        .hero-tagline {
            font-family: 'Orbitron', sans-serif;
            font-size: 0.75rem;
            letter-spacing: 5px;
            color: var(--warning);
            text-transform: uppercase;
            margin-bottom: 20px;
            position: relative;
            z-index: 1;
        }

        .hero h1 {
            font-family: 'Orbitron', monospace;
            font-size: clamp(2.8rem, 7vw, 4.5rem);
            font-weight: 900;
            margin-bottom: 24px;
            line-height: 1.1;
            letter-spacing: 3px;
            text-transform: uppercase;
            background: linear-gradient(135deg, #00ffff 0%, #fff 40%, #f59e0b 70%, #00ffff 100%);
            background-size: 300% auto;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: heroTextShine 6s ease-in-out infinite;
            filter: drop-shadow(0 0 20px rgba(0, 255, 255, 0.3));
            position: relative;
            z-index: 1;
        }

        @keyframes heroTextShine {
            0% { background-position: 0% center; }
            50% { background-position: 100% center; }
            100% { background-position: 0% center; }
        }"""

if old_hero in content:
    content = content.replace(old_hero, new_hero)
    changes += 1
    print("1. Hero CSS upgraded")
else:
    print("1. SKIP - Hero CSS not found")

# 2. Make hero CTA secondary button gold instead of cyan
old_cta2 = """            color: #00ffff;
            background: transparent;
            border: 1px solid rgba(0, 255, 255, 0.4);
            padding: 14px 32px;"""
new_cta2 = """            color: #f59e0b;
            background: transparent;
            border: 1px solid rgba(245, 158, 11, 0.4);
            padding: 16px 36px;"""
if old_cta2 in content:
    content = content.replace(old_cta2, new_cta2)
    changes += 1
    print("2. CTA secondary button gold")

# 3. Upgrade hero CTA secondary hover
old_cta2h = """            background: rgba(0, 255, 255, 0.08);
            border-color: rgba(0, 255, 255, 0.7);
            transform: translateY(-2px);"""
new_cta2h = """            background: rgba(245, 158, 11, 0.1);
            border-color: rgba(245, 158, 11, 0.7);
            transform: translateY(-3px);
            box-shadow: 0 4px 20px rgba(245, 158, 11, 0.25);"""
if old_cta2h in content:
    content = content.replace(old_cta2h, new_cta2h)
    changes += 1
    print("3. CTA secondary hover gold")

# 4. Upgrade primary CTA
old_cta1 = """            padding: 14px 32px;
            border-radius: 8px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            text-decoration: none;
            transition: all 0.3s;
            box-shadow: 0 4px 15px rgba(0, 255, 255, 0.25);
        }

        .hero-cta-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(0, 255, 255, 0.4);"""
new_cta1 = """            padding: 16px 36px;
            border-radius: 8px;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            text-decoration: none;
            transition: all 0.3s;
            box-shadow: 0 4px 20px rgba(0, 255, 255, 0.35), 0 0 40px rgba(0, 255, 255, 0.1);
        }

        .hero-cta-primary:hover {
            transform: translateY(-3px) scale(1.02);
            box-shadow: 0 8px 35px rgba(0, 255, 255, 0.5), 0 0 60px rgba(0, 255, 255, 0.15);"""
if old_cta1 in content:
    content = content.replace(old_cta1, new_cta1)
    changes += 1
    print("4. Primary CTA upgraded")

# 5. Replace home-section-accent with home-divider and add hero-stats-bar + hero-tagline
old_accent = """        /* Section Accent Lines */
        .home-section-accent {
            height: 1px;
            max-width: 200px;
            margin: 0 auto 30px;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.3), transparent);
        }"""
new_accent = """        /* Hero Stats Bar */
        .hero-stats-bar {
            display: flex;
            justify-content: center;
            gap: 50px;
            position: relative;
            z-index: 1;
        }
        .hero-stat { text-align: center; }
        .hero-stat-value {
            font-family: 'Orbitron', sans-serif;
            font-size: 1.8rem;
            font-weight: 700;
            background: linear-gradient(135deg, #00ffff, #fff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .hero-stat-desc {
            font-size: 0.7rem;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 4px;
        }
        @media (max-width: 600px) {
            .hero-stats-bar { gap: 25px; flex-wrap: wrap; }
            .hero-stat-value { font-size: 1.3rem; }
        }

        /* Home Section Dividers */
        .home-divider {
            height: 1px;
            max-width: 800px;
            margin: 10px auto;
            background: linear-gradient(90deg, transparent, rgba(0, 255, 255, 0.25), rgba(245, 158, 11, 0.2), rgba(139, 92, 246, 0.2), transparent);
        }"""
if old_accent in content:
    content = content.replace(old_accent, new_accent)
    changes += 1
    print("5. Stats bar + dividers CSS added")

# 6. Upgrade feature-icon to have colored borders per card
old_icon = """        .feature-icon {
            width: 60px;
            height: 60px;
            margin: 0 auto 18px;
            background: rgba(0, 255, 255, 0.08);
            border: 1px solid rgba(0, 255, 255, 0.2);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.6rem;
            transition: all 0.3s;
        }

        .feature-card:hover .feature-icon {
            background: rgba(0, 255, 255, 0.15);
            border-color: rgba(0, 255, 255, 0.5);
            box-shadow: 0 0 20px rgba(0, 255, 255, 0.15);
            transform: scale(1.05);
        }

        .feature-card h3 {
            font-family: 'Orbitron', monospace;
            font-size: clamp(1rem, 2vw, 1.2rem);
            color: #00ffff;
            margin-bottom: 12px;
        }"""
new_icon = """        .feature-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto 18px;
            background: linear-gradient(135deg, rgba(0, 255, 255, 0.1), rgba(139, 92, 246, 0.05));
            border: 1px solid rgba(0, 255, 255, 0.25);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.7rem;
            transition: all 0.3s;
            position: relative;
        }

        .feature-card:hover .feature-icon {
            background: linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(245, 158, 11, 0.1));
            border-color: rgba(0, 255, 255, 0.6);
            box-shadow: 0 0 25px rgba(0, 255, 255, 0.2), 0 0 50px rgba(0, 255, 255, 0.05);
            transform: scale(1.08);
        }

        .feature-card h3 {
            font-family: 'Orbitron', monospace;
            font-size: clamp(1rem, 2vw, 1.2rem);
            color: var(--warning);
            margin-bottom: 12px;
        }"""
if old_icon in content:
    content = content.replace(old_icon, new_icon)
    changes += 1
    print("6. Feature icons upgraded")

# 7. Upgrade CTA bottom section
old_cta_main = """            background: linear-gradient(135deg, #00ffff, #0ea5e9);
            border: none;
            padding: 16px 40px;
            border-radius: 8px;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 255, 255, 0.25);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            display: inline-block;
        }

        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 30px rgba(0, 255, 255, 0.4);"""
new_cta_main = """            background: linear-gradient(135deg, #00ffff, #0ea5e9, #8b5cf6);
            background-size: 200% auto;
            border: none;
            padding: 18px 48px;
            border-radius: 8px;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.4s ease;
            box-shadow: 0 4px 25px rgba(0, 255, 255, 0.3), 0 0 50px rgba(139, 92, 246, 0.1);
            text-transform: uppercase;
            letter-spacing: 2px;
            display: inline-block;
            animation: ctaBtnShine 4s ease-in-out infinite;
        }

        @keyframes ctaBtnShine {
            0%, 100% { background-position: 0% center; }
            50% { background-position: 100% center; }
        }

        .cta-button:hover {
            transform: translateY(-3px) scale(1.03);
            box-shadow: 0 10px 40px rgba(0, 255, 255, 0.45), 0 0 60px rgba(139, 92, 246, 0.15);"""
if old_cta_main in content:
    content = content.replace(old_cta_main, new_cta_main)
    changes += 1
    print("7. CTA button upgraded")

# 8. Update hero HTML - add tagline, stats bar, dividers
old_hero_html = """                <section class="hero">
                    <h1 class="reveal">THE END OF THE BULLSHIT</h1>
                    <p class="reveal">A new standard for sports betting has arrived. Built on absolute proof, radical transparency, and zero excuses.</p>
                    <div class="hero-cta-row reveal">
                        <a onclick="showSection('picks')" class="hero-cta-primary">Start Tracking</a>
                        <a onclick="showSection('leaderboards')" class="hero-cta-secondary">View Leaderboards</a>
                    </div>
                </section>"""
new_hero_html = """                <section class="hero">
                    <div class="hero-tagline reveal">Verified Pick Tracking Platform</div>
                    <h1 class="reveal">THE END OF THE BULLSHIT</h1>
                    <p class="reveal">A new standard for sports betting has arrived. Built on absolute proof, radical transparency, and zero excuses.</p>
                    <div class="hero-cta-row reveal">
                        <a onclick="showSection('picks')" class="hero-cta-primary">Start Tracking</a>
                        <a onclick="showSection('leaderboards')" class="hero-cta-secondary">View Leaderboards</a>
                    </div>
                    <div class="hero-stats-bar reveal">
                        <div class="hero-stat">
                            <div class="hero-stat-value">6</div>
                            <div class="hero-stat-desc">Sports</div>
                        </div>
                        <div class="hero-stat">
                            <div class="hero-stat-value" style="background: linear-gradient(135deg, #f59e0b, #fff); -webkit-background-clip: text; background-clip: text;">100%</div>
                            <div class="hero-stat-desc">Transparent</div>
                        </div>
                        <div class="hero-stat">
                            <div class="hero-stat-value" style="background: linear-gradient(135deg, #8b5cf6, #fff); -webkit-background-clip: text; background-clip: text;">FREE</div>
                            <div class="hero-stat-desc">Forever</div>
                        </div>
                    </div>
                </section>"""
if old_hero_html in content:
    content = content.replace(old_hero_html, new_hero_html)
    changes += 1
    print("8. Hero HTML upgraded")

# 9. Add dividers between homepage sections
old_sec1 = """                </section>


                <section class="section">
                    <div class="section-header reveal">
                        <h2>Enter <span class="highlight">The Arena</span></h2>"""
new_sec1 = """                </section>

                <div class="home-divider"></div>
                <section class="section">
                    <div class="section-header reveal">
                        <h2>Enter <span class="highlight">The Arena</span></h2>"""
if old_sec1 in content:
    content = content.replace(old_sec1, new_sec1)
    changes += 1
    print("9. Divider before Arena added")

old_sec2 = """                </section>


                <section class="section">
                    <div class="section-header reveal">
                        <h2>Community <span class="highlight">Forums</span></h2>"""
new_sec2 = """                </section>

                <div class="home-divider"></div>
                <section class="section">
                    <div class="section-header reveal">
                        <h2>Community <span class="highlight">Forums</span></h2>"""
if old_sec2 in content:
    content = content.replace(old_sec2, new_sec2)
    changes += 1
    print("10. Divider before Forums added")

old_sec3 = """                </section>


                <section class="cta">"""
new_sec3 = """                </section>

                <div class="home-divider"></div>
                <section class="cta">"""
if old_sec3 in content:
    content = content.replace(old_sec3, new_sec3)
    changes += 1
    print("11. Divider before CTA added")

# 10. Make section-header highlight gold instead of just cyan
old_hl = """        .section-header .highlight {
            color: #00ffff;
            -webkit-text-fill-color: #00ffff;
        }"""
new_hl = """        .section-header .highlight {
            background: linear-gradient(135deg, #00ffff, #f59e0b);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }"""
if old_hl in content:
    content = content.replace(old_hl, new_hl)
    changes += 1
    print("12. Highlight text now gradient")

with open('C:/Users/Nima/trustmyrecord/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nDone! {changes} changes applied.")
