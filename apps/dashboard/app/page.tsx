"use client";

import "@/components/landing/landing.css";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroSection } from "@/components/landing/hero-section";
import { DeploymentCapabilities } from "@/components/landing/deployment-capabilities";
import { ArchitectureSection } from "@/components/landing/architecture-section";
import { DeploymentWorkflow } from "@/components/landing/deployment-workflow";
import { ProductPreviews } from "@/components/landing/product-previews";
import { DeveloperTools } from "@/components/landing/developer-tools";
import { ObservabilitySection } from "@/components/landing/observability-section";
import { UseCasesSection } from "@/components/landing/use-cases-section";
import { CtaSection } from "@/components/landing/cta-section";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function LandingPage() {
  return (
    <div className="wz-landing">
      {/* Top Sticky Glass Navigation */}
      <LandingNav />

      {/* Main Page Flow */}
      <main>
        {/* Hero Section with Signature Cloud Architecture Visualization */}
        <HeroSection />

        {/* 4 Core Pillars: Frontend, Backend, Edge Functions, Databases */}
        <DeploymentCapabilities />

        {/* Multi-Layer System Architecture Section */}
        <ArchitectureSection />

        {/* 4-Step Deployment Workflow & Terminal / CLI / MCP Previews */}
        <DeploymentWorkflow />

        {/* Authentic Focused Product Interface Previews */}
        <ProductPreviews />

        {/* Developer Tooling: CLI, Flow, Zero-Idle Cron, MCP */}
        <DeveloperTools />

        {/* Observability, Health Probing & Trust */}
        <ObservabilitySection />

        {/* Real-World Production Architectural Use Cases */}
        <UseCasesSection />

        {/* Final Conversion Section */}
        <CtaSection />
      </main>

      {/* Complete Footer */}
      <LandingFooter />
    </div>
  );
}
