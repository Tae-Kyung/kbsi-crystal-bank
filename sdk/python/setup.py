from setuptools import setup, find_packages

setup(
    name="kbsi-protein",
    version="0.1.0",
    description="KBSI Protein Crystallization Bank Python SDK",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="KBSI",
    url="https://github.com/Tae-Kyung/kbsi-crystal-bank",
    packages=find_packages(),
    install_requires=["requests>=2.28.0"],
    python_requires=">=3.8",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
    ],
)
