#!/usr/bin/env python3
"""
Setup script for AgentFlow Python integration package
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="agentflow-python",
    version="0.1.0",
    author="AgentFlow Contributors",
    description="Python integration for AgentFlow - Universal execution tracing for AI agent systems",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/ClemenceChee/AgentFlow",
    packages=find_packages(),
    py_modules=["agentflow_python"],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: System :: Monitoring",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    python_requires=">=3.8",
    install_requires=[
        # No dependencies - uses subprocess to call Node.js AgentFlow
    ],
    keywords="agentflow, tracing, monitoring, ai, agents, observability",
    project_urls={
        "Bug Reports": "https://github.com/ClemenceChee/AgentFlow/issues",
        "Source": "https://github.com/ClemenceChee/AgentFlow",
        "Documentation": "https://github.com/ClemenceChee/AgentFlow#readme",
    },
)