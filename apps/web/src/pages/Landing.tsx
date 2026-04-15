import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { useInView } from '../hooks/useInView';
import {
  MapPin, SlidersHorizontal, GripVertical, CheckCircle2,
  Star, BookMarked, ArrowRight,
} from 'lucide-react';

// ── Landing Page ──────────────────────────────────────────────────────────────
export function Landing() {
  const [whyRef,  whyInView]  = useInView();
  const [howRef,  howInView]  = useInView();
  const [dataRef, dataInView] = useInView();
  const [ctaRef,  ctaInView]  = useInView();

  const vis = (inView: boolean, delay = '') =>
    `reveal${inView ? ' in-view' : ''}${delay ? ' ' + delay : ''}`;

  return (
    <div className="min-h-screen bg-white text-dark overflow-x-hidden">
      <Navbar />

      {/* ── HERO: fills first viewport completely ─────────────────────────── */}
      <section className="relative bg-[#EEF4FF] overflow-x-hidden min-h-[calc(100vh-72px)] flex items-center py-20 lg:py-24 xl:py-2">
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[700px] h-[700px] rounded-full bg-sky-300/20 blur-3xl" />
          <div className="absolute bottom-0 -left-20 w-[500px] h-[500px] rounded-full bg-navy/[0.04] blur-3xl" />
        </div>

        <div className="relative max-w-[1700px] mx-auto px-8 lg:px-16 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 lg:gap-24 items-center">

            {/* Left: copy */}
            <div>
              <div
                className="hero-in inline-flex items-center gap-2 bg-navy border text-white text-[13px] font-extrabold px-4 py-2 rounded-full mb-8"
                style={{ animationDelay: '0ms' }}
              >
                Singapore Secondary School Decision Support
              </div>

              <h1
                className="hero-in text-[56px] md:text-[70px] lg:text-[82px] xl:text-[92px] font-extrabold tracking-[-0.04em] leading-[0.98] text-dark max-w-[720px] xl:max-w-[780px]"
                style={{ animationDelay: '80ms' }}
              >
                <span className="block whitespace-nowrap">Make confident</span>
                <span className="block text-sky-300 whitespace-nowrap">school decisions.</span>
              </h1>

              <p
                className="hero-in mt-8 text-[19px] md:text-[21px] leading-[1.75] text-muted max-w-[560px]"
                style={{ animationDelay: '180ms' }}
              >
                Optima analyses your family's priorities, real commute times, and official MOE data — then ranks every Singapore secondary school for your child.
              </p>

              <div
                className="hero-in mt-10 flex items-center gap-4 flex-wrap"
                style={{ animationDelay: '280ms' }}
              >
                <Link to="/register">
                  <button className="bg-sky-300 text-white font-bold px-8 py-4 rounded-xl text-[17px] hover:bg-navy-700 hover:-translate-y-px active:scale-[0.97] transition-all duration-150 shadow-md hover:shadow-lg flex items-center gap-2.5">
                    Get started for free
                    <ArrowRight size={17} />
                  </button>
                </Link>
                <Link to="/login">
                  <button className="bg-white text-navy font-semibold px-8 py-4 rounded-xl text-[17px] border border-gray-200 hover:bg-gray-50 hover:border-navy/30 hover:-translate-y-px active:scale-[0.97] transition-all duration-150">
                    Sign in
                  </button>
                </Link>
              </div>

              <div
                className="hero-in mt-14 flex items-center gap-12 flex-wrap border-t border-navy/12 pt-8"
                style={{ animationDelay: '360ms' }}
              >
                {[
                  { val: '125+', label: 'Secondary Schools' },
                  { val: 'MOE',  label: 'Official Data Source' },
                  { val: 'Live', label: 'Transit Routing' },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col gap-1">
                    <span className="text-[26px] font-extrabold text-dark tracking-[-0.02em]">{stat.val}</span>
                    <span className="text-[14px] text-muted font-medium">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: person image */}
            <div
              className="hero-in hidden lg:block"
              style={{ animationDelay: '200ms' }}
            >
              <img
                src="/Person.png"
                alt="Person using Optima"
                className="w-full h-auto max-h-[calc(100vh-100px)] object-contain"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── DECISIONS EXPLAINED — 2 columns ──────────────────────────────────── */}
      <section className="bg-white">
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-28 lg:py-40">
          <div ref={whyRef} className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-20 items-center">
            {/* Left: text content */}
            <div>
            <span className={`${vis(whyInView)} inline-block text-[12px] font-bold text-white uppercase tracking-[0.22em] mb-6 bg-navy px-4 py-2 rounded-full`}>
              How it works
            </span>
            <h2 className={`${vis(whyInView, 'reveal-d1')} text-[48px] md:text-[58px] lg:text-[66px] font-extrabold tracking-[-0.03em] leading-[1.05] text-dark mb-8`}>
              Decisions,{' '}
              <span className="text-sky-300">Explained.</span>
            </h2>
            <p className={`${vis(whyInView, 'reveal-d2')} text-[18px] leading-[1.85] text-muted mb-10`}>
              Instead of comparing schools across multiple pages, Optima shows how each option performs against your priorities. See score breakdowns, transit times, and what factors matter most.
            </p>
            <ul className={`${vis(whyInView, 'reveal-d3')} space-y-4 text-left inline-block`}>
              {[
                'Real transit times via OneMap public transport routing',
                'Official MOE data — CCAs, programmes, subjects, distinctive programmes',
                'Transparent scoring with per-criterion breakdowns',
              ].map((item) => (
                <li key={item} className="flex items-start gap-4">
                  <CheckCircle2 size={20} className="text-navy mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] text-dark/80 leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
            <div className={`${vis(whyInView, 'reveal-d4')} mt-10`}>
              <Link to="/register">
                <button className="inline-flex items-center gap-2.5 bg-sky-300 text-white font-semibold px-8 py-4 rounded-xl text-[16px] hover:bg-navy-600 hover:-translate-y-px active:scale-[0.97] transition-all duration-150 shadow-sm hover:shadow-md">
                  Try Optima free
                  <ArrowRight size={16} />
                </button>
              </Link>
            </div>
          </div>

          {/* Right: Image */}
          <div className={`hidden lg:flex items-center justify-center ${vis(whyInView, 'reveal-d2')}`}>
            <img
              src="/recommendation.png"
              alt="Recommendation explanations"
              className="w-full h-auto rounded-2xl object-cover shadow-[0_8px_40px_rgba(4,56,117,0.10)]"
            />
          </div>
          </div>
        </div>
      </section>

      {/* ── FIVE STEPS TO YOUR SHORTLIST ─────────────────────────────────────── */}
      <section className="bg-[#F2F7FF]">
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-28 lg:py-40">
          <div ref={howRef}>
            <div className={`text-center mb-20 ${vis(howInView)}`}>
              <span className="inline-block text-[12px] font-bold text-navy uppercase tracking-[0.22em] mb-5 bg-navy-50 px-4 py-2 rounded-full border border-navy-100">
                Getting started
              </span>
              <h2 className="text-[46px] md:text-[58px] font-extrabold tracking-[-0.03em] text-dark">
                Five steps to your shortlist.
              </h2>
              <p className="text-[18px] text-muted mt-5 max-w-[520px] mx-auto leading-relaxed">
                Set your constraints, rank your priorities, and let Optima do the scoring.
              </p>
            </div>

            {/* Step progress — all 5 steps always show their specific icon */}
            <div
              className={`bg-white rounded-2xl border border-gray-200 p-8 lg:p-12 mb-12 ${vis(howInView, 'reveal-d1')}`}
              style={{ boxShadow: '0 2px 28px rgba(4,56,117,0.07)' }}
            >
              {/*
                Each step is flex-1 (20% of row). Circle centers land at 10%, 30%, 50%, 70%, 90%.
                Absolute connector lines span between those centers for correct visual alignment.
                Steps 1 & 2 are done → sky-300 connectors for 10%→30% and 30%→50% spans.
              */}
              <div className="relative flex">
                {/* Gray background track: step-1-center → step-5-center */}
                <div className="absolute h-[2px] bg-gray-200" style={{ top: '23px', left: '10%', right: '10%' }} />
                {/* Sky-300 fill: step-1-center → step-2-center (done) */}
                <div className="absolute h-[2px] bg-sky-300" style={{ top: '23px', left: '10%', width: '20%' }} />
                {/* Sky-300 fill: step-2-center → step-3-center (done) */}
                <div className="absolute h-[2px] bg-sky-300" style={{ top: '23px', left: '30%', width: '20%' }} />

                {([
                  { n: 1, status: 'done'    as const, Icon: MapPin,            label: 'Enter location',  desc: 'Add your home postal code for real transit times to each school.' },
                  { n: 2, status: 'done'    as const, Icon: SlidersHorizontal, label: 'Set must-haves',  desc: 'Define hard constraints — a required CCA, programme, or max commute.' },
                  { n: 3, status: 'active'  as const, Icon: GripVertical, label: 'Rank priorities', desc: 'Drag criteria into order. ROC weights convert rankings into scores.' },
                  { n: 4, status: 'pending' as const, Icon: Star,              label: 'Get shortlist',   desc: 'Up to 5 schools with per-criterion scores and clear explanations.' },
                  { n: 5, status: 'pending' as const, Icon: BookMarked,        label: 'Explore & save',  desc: 'Dive into school profiles, read reviews, and save your picks.' },
                ]).map((step) => {
                  // Fallback: if the icon component is undefined (missing export), use GripVertical
                  const StepIcon = step.Icon ?? GripVertical;
                  if (step.n === 3) {
                    console.log('[Landing] Step 3 icon component:', StepIcon?.displayName ?? StepIcon);
                  }
                  return (
                  <div key={step.n} className="flex-1 flex flex-col items-center">
                    {/* Icon circle — z-10 so it sits above the absolute connector lines */}
                    <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                      step.status === 'done'
                        ? 'bg-sky-300 border-sky-300 text-white shadow-[0_0_0_5px_rgba(125,211,252,0.3)]'
                        : step.status === 'active'
                        ? 'bg-navy border-navy text-white shadow-[0_0_0_5px_rgba(4,56,117,0.15)]'
                        : 'bg-white border-gray-300 text-gray-400'
                    }`}>
                      <StepIcon size={20} strokeWidth={2.2} className="shrink-0" />
                    </div>

                    {/* Labels — consistent vertical rhythm via min-h on description */}
                    <div className="mt-6 px-2 text-center w-full">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-[0.18em] mb-2">Step {step.n}</p>
                      <p className={`text-[14px] font-bold leading-snug mb-2 ${
                        step.status === 'active' ? 'text-navy' : step.status === 'done' ? 'text-dark' : 'text-dark/65'
                      }`}>{step.label}</p>
                      <p className={`text-[13px] leading-relaxed min-h-[52px] ${
                        step.status === 'pending' ? 'text-gray-400' : 'text-muted'
                      }`}>{step.desc}</p>
                      <span className={`inline-block mt-3 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        step.status === 'done'
                          ? 'bg-sky-100 text-sky-700 border border-sky-300'
                          : step.status === 'active'
                          ? 'bg-navy-50 text-navy border border-navy-100'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}>
                        {step.status === 'done' ? 'Completed' : step.status === 'active' ? 'In Progress' : 'Pending'}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className={`text-center ${vis(howInView, 'reveal-d2')}`}>
              <Link to="/register">
                <button className="inline-flex items-center gap-2.5 bg-sky-300 text-white font-semibold px-10 py-4 rounded-xl text-[17px] hover:bg-navy-700 hover:-translate-y-px active:scale-[0.97] transition-all duration-150 shadow-md hover:shadow-lg">
                  Start your search
                  <ArrowRight size={17} />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      

      {/* ── 100% REAL DATA ───────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-28 lg:py-44">
          <div
            ref={dataRef}
            className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-16 lg:gap-28 items-center"
          >
            <div className={vis(dataInView)}>
              <span className="inline-block text-[12px] font-bold text-white uppercase tracking-[0.22em] mb-6 bg-navy px-4 py-2 rounded-full border border-navy-100">
                Data integrity
              </span>
              <h2 className="text-[48px] md:text-[58px] font-extrabold tracking-[-0.03em] leading-[1.06] text-dark mb-8">
                100% real data.
              </h2>
              <p className="text-[18px] text-muted leading-[1.85] max-w-[500px] mb-10">
                All school information in Optima is sourced from official public datasets. No estimates, no guesswork — traceable inputs, explainable outcomes.
              </p>
              <div className="space-y-4">
                {[
                  { accent: 'bg-red-500',     name: 'MOE',         long: 'Ministry of Education', desc: 'School profiles, CCAs, programmes, subjects' },
                  { accent: 'bg-sky-500',      name: 'data.gov.sg', long: 'Singapore Open Data',   desc: 'School directory, geospatial datasets' },
                  { accent: 'bg-emerald-500',  name: 'OneMap',      long: 'SLA Mapping Platform',  desc: 'Real routing, public transport commute times' },
                ].map((src) => (
                  <div
                    key={src.name}
                    className="flex items-center gap-4 p-5 rounded-xl bg-white border border-gray-300 hover:border-navy-200 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200"
                  >
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${src.accent}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-dark leading-tight">{src.name}</p>
                      <p className="text-[14px] text-muted mt-0.5">{src.long} · {src.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`flex items-center justify-center ${vis(dataInView, 'reveal-d2')}`}>
              <img
                src="/data_image.png"
                alt="Optima data sources visualization"
                className="w-full h-auto rounded-2xl shadow-[0_8px_40px_rgba(4,56,117,0.10)]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────────────────────── */}
      <footer className="bg-navy border-t border-white/[0.08]">
        <div className="max-w-[1700px] mx-auto px-8 lg:px-16 py-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center">
              <img src="/favicon.png" alt="Optima" className="w-5 h-5" />
            </div>
            <span className="text-[16px] font-bold text-white">Optima</span>
          </div>
          <p className="text-[14px] text-white">
            SC2006 Software Engineering · TCE2 Group 26
          </p>
        </div>
      </footer>
    </div>
  );
}
